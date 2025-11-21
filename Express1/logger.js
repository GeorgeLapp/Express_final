// send-log.mjs
//
// Скрипт отправляет POST запрос на:
// https://express1.ru/backend/frontend-log
//
// Тело запроса: { message: "лог" }
//
// Запуск:  node send-log.mjs

const url = "https://express1.ru/backend/frontend-log";

async function sendLog() {
  try {
    const payload = {
      message: "лог"
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    console.log("Ответ сервера:", text);
  } catch (err) {
    console.error("Ошибка отправки лога:", err);
  }
}

sendLog();
