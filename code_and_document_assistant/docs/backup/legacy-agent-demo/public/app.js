const message = document.querySelector("#message");
const reply = document.querySelector("#reply");
const send = document.querySelector("#send");

send.addEventListener("click", async () => {
  reply.textContent = "Thinking...";

  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: message.value }),
  });

  const data = await response.json();
  reply.textContent = data.reply || data.error || "No response";
});
