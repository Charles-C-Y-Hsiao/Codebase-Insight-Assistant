"""Bounded stdin-only document parser / static validator. Never executes input code."""
import io
import json
import sys
import zipfile
from html.parser import HTMLParser

MAX_BYTES = 16 * 1024 * 1024
MAX_XML = 32 * 1024 * 1024
segments, warnings = [], []

def add(text, location, **locator):
    if text.strip():
        if len(segments) >= 2000:
            raise ValueError('超過 2000 個文件區段')
        segments.append({'text': text, 'location': location, 'locator': locator})

def archive(data):
    z = zipfile.ZipFile(io.BytesIO(data))
    if len(z.infolist()) > 5000 or sum(i.file_size for i in z.infolist()) > MAX_XML:
        raise ValueError('Office 壓縮檔展開大小或項目超限')
    return z

def xml(z, name):
    from lxml import etree
    content = z.read(name)
    if b'<!DOCTYPE' in content.replace(b'\x00', b'').upper() or b'<!ENTITY' in content.replace(b'\x00', b'').upper():
        raise ValueError('拒絕含 DTD / ENTITY 的 XML')
    return etree.fromstring(content, etree.XMLParser(resolve_entities=False, load_dtd=False, no_network=True))

def local(element):
    return element.tag.rsplit('}', 1)[-1] if isinstance(element.tag, str) else ''

def texts(element):
    return ''.join(e.text or '' for e in element.iter() if local(e) == 't')

def docx(data):
    z = archive(data)
    root = xml(z, 'word/document.xml')
    body = next(e for e in root if local(e) == 'body')
    heading, paragraph, table = '(無標題)', 0, 0
    for e in body:
        if local(e) == 'p':
            paragraph += 1
            style = next((v for c in e.iter() if local(c) == 'pStyle' for k, v in c.attrib.items() if k.endswith('}val')), '')
            text = texts(e)
            if style.lower().startswith('heading') or style.startswith('標題'):
                heading = text
            add(text, f'標題：{heading} / 段落 {paragraph}', heading=heading, paragraph=paragraph)
        elif local(e) == 'tbl':
            table += 1
            rows = [' | '.join(texts(c) for c in r if local(c) == 'tc') for r in e if local(r) == 'tr']
            add('\n'.join(rows), f'標題：{heading} / 表格 {table}', heading=heading, table=table)
    warnings.append('DOCX 僅解析本文段落與表格；頁首頁尾、註解、文字方塊及修訂語意未納入。')

def pptx(data):
    import posixpath
    z = archive(data)
    relations = {e.get('Id'): e.get('Target') for e in xml(z, 'ppt/_rels/presentation.xml.rels') if e.get('TargetMode') != 'External'}
    presentation = xml(z, 'ppt/presentation.xml')
    for number, e in enumerate((e for e in presentation.iter() if local(e) == 'sldId'), 1):
        rid = next((v for k, v in e.attrib.items() if k.endswith('}id')), None)
        target = relations.get(rid, '')
        name = target.lstrip('/') if target.startswith('/') else posixpath.normpath('ppt/' + target)
        if not name.startswith('ppt/slides/') or '..' in name.split('/'):
            raise ValueError('無效投影片關聯')
        slide = xml(z, name)
        paragraphs = []
        for element in slide.iter():
            if local(element) == 'p':
                text = texts(element)
                if text:
                    paragraphs.append(text)
        # 整張投影片為一個區段，保留所有段落與表格儲存格次序。
        tables = []
        for table in (x for x in slide.iter() if local(x) == 'tbl'):
            tables.append('\n'.join(' | '.join(texts(c) for c in r if local(c) == 'tc') for r in table if local(r) == 'tr'))
        add('\n'.join(paragraphs + tables), f'投影片 {number}', slide=number)
        if not paragraphs and not tables:
            warnings.append(f'投影片 {number} 沒有文字；圖像或圖表可能需 OCR / 人工核對')
    warnings.append('PPTX 圖像、SmartArt、嵌入物件及講者備註未解析；投影片內視覺閱讀順序需人工核對。')

def xlsx(data):
    import posixpath
    from openpyxl.styles.numbers import is_date_format
    from openpyxl.utils.datetime import from_excel, CALENDAR_MAC_1904, CALENDAR_WINDOWS_1900
    z = archive(data)
    book = xml(z, 'xl/workbook.xml')
    rels = {r.get('Id'): r.get('Target') for r in xml(z, 'xl/_rels/workbook.xml.rels') if r.get('TargetMode') != 'External'}
    strings = [texts(e) for e in xml(z, 'xl/sharedStrings.xml')] if 'xl/sharedStrings.xml' in z.namelist() else []
    epoch = CALENDAR_MAC_1904 if any(e.get('date1904') in ('1','true') for e in book if local(e) == 'workbookPr') else CALENDAR_WINDOWS_1900
    formats, styles = {}, []
    if 'xl/styles.xml' in z.namelist():
        from openpyxl.styles.numbers import BUILTIN_FORMATS
        formats.update(BUILTIN_FORMATS)
        style_root = xml(z, 'xl/styles.xml')
        for e in style_root.iter():
            if local(e) == 'numFmt':
                formats[int(e.get('numFmtId'))] = e.get('formatCode', '')
        for e in style_root:
            if local(e) == 'cellXfs':
                styles = [formats.get(int(x.get('numFmtId', '0')), '') for x in e]
    for sheet in (e for e in book.iter() if local(e) == 'sheet'):
        title = sheet.get('name')
        rid = next(v for k,v in sheet.attrib.items() if k.endswith('}id'))
        target = rels.get(rid, '')
        name = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
        if not name.startswith('xl/worksheets/') or '..' in name.split('/'):
            raise ValueError('無效工作表關聯')
        root = xml(z, name)
        header = None
        for row in (r for r in root.iter() if local(r) == 'row'):
            cells = []
            for cell in row:
                if local(cell) != 'c':
                    continue
                ref, kind = cell.get('r'), cell.get('t')
                value = next((e.text for e in cell if local(e) == 'v'), None)
                formula = next((e for e in cell if local(e) == 'f'), None)
                if kind == 's' and value is not None:
                    value = strings[int(value)]
                elif kind == 'inlineStr':
                    value = texts(cell)
                elif kind == 'b':
                    value = 'TRUE' if value == '1' else 'FALSE'
                elif value is not None and kind in (None,'n'):
                    style = int(cell.get('s','0'))
                    if style < len(styles) and is_date_format(styles[style]):
                        try:
                            value = str(from_excel(float(value), epoch))
                        except (ValueError, OverflowError):
                            warnings.append(f'{title}!{ref} 日期格式無法轉換')
                if formula is not None:
                    value = '公式=' + (formula.text or '[共享公式]') + '; 快取=' + (value if value is not None else '[缺少，未計算]')
                    warnings.append(f'{title}!{ref} 使用公式快取；未重新計算，不保證最新')
                if value is not None:
                    cells.append(f'{ref}: {value}')
            if not cells:
                continue
            if header is None:
                header = '首個非空列（候選表頭，未經語意確認）：' + ' | '.join(cells)
            text = header + '\n' + ' | '.join(cells)
            add(text, f'工作表 {title} / 列 {row.get("r")} / ' + ', '.join(c.split(':',1)[0] for c in cells), sheet=title, row=row.get('r'), cells=[c.split(':',1)[0] for c in cells])
        merges = [e.get('ref') for e in root.iter() if local(e) == 'mergeCell']
        if merges:
            add('合併儲存格：' + ', '.join(merges), f'工作表 {title} / 合併範圍', sheet=title, merged=merges)
        if sheet.get('state') not in (None,'visible'):
            warnings.append(f'工作表 {title} 為隱藏工作表；已明確納入索引')

def pdf(data):
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        raise ValueError('加密 PDF 尚未提供解密流程')
    if len(reader.pages) > 500:
        raise ValueError('PDF 超過 500 頁上限')
    for number, page in enumerate(reader.pages, 1):
        text = page.extract_text(extraction_mode='layout') or ''
        if text.strip():
            add(text, f'PDF 第 {number} 頁', page=number)
        else:
            warnings.append(f'PDF 第 {number} 頁沒有文字；可能是掃描頁，需 OCR 或人工核對')
    warnings.append('PDF 保留頁面文字排列；複雜表格與多欄閱讀順序需人工核對，未宣稱還原表格結構。')

class HTMLText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
        if tag in ('p','div','tr','h1','h2','h3','br'):
            self.parts.append('\n')
        if tag in ('td','th'):
            self.parts.append(' | ')
    def handle_endtag(self, tag):
        if tag in ('script','style') and self.skip:
            self.skip -= 1
    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)

def main():
    mode = sys.argv[1]
    data = sys.stdin.buffer.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError('輸入超過 16 MiB')
    if mode == 'verify-python':
        compile(data.decode('utf-8-sig'), '<approved-input>', 'exec', dont_inherit=True)
        return {'status':'passed','message':'Python compile 語法檢查通過；未執行程式、import 或功能測試'}
    if mode == 'verify-html':
        class Audit(HTMLParser):
            def __init__(self):
                super().__init__()
                self.tags, self.ids, self.errors = set(), set(), []
            def handle_starttag(self, tag, attrs):
                self.tags.add(tag)
                attrs = dict(attrs)
                if tag == 'html' and not attrs.get('lang'):
                    self.errors.append('html 缺少 lang 屬性')
                if attrs.get('id'):
                    if attrs['id'] in self.ids:
                        self.errors.append('重複 id: ' + attrs['id'])
                    self.ids.add(attrs['id'])
        audit = Audit()
        audit.feed(data.decode('utf-8-sig'))
        audit.errors.extend('缺少 '+tag for tag in ('html','title','body') if tag not in audit.tags)
        return {'status':'failed' if audit.errors else 'passed','message':'；'.join(audit.errors) or 'HTML 基本結構檢查通過；非完整 HTML 標準驗證，未執行 JS 或瀏覽器功能'}
    if mode == '.html':
        parser = HTMLText()
        parser.feed(data.decode('utf-8-sig'))
        add(''.join(parser.parts), 'HTML 原始碼行 1–' + str(data.count(b'\n') + 1), startLine=1, endLine=data.count(b'\n')+1)
        warnings.append('HTML 僅解析可見文字，未執行 JavaScript、載入外部資源或驗證瀏覽器行為')
    else:
        {'.pdf':pdf,'.docx':docx,'.pptx':pptx,'.xlsx':xlsx}[mode](data)
    if not segments:
        raise ValueError('未取得可搜尋文字；' + '；'.join(warnings[:10]))
    return {'segments':segments,'warnings':warnings}

if __name__ == '__main__':
    try:
        result = main()
    except Exception as exc:
        result = {'error':str(exc)[:2000], 'code':'PARSE_OR_VALIDATION_ERROR'}
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
