// send-log.mjs
//
// Скрипт отправляет POST запрос на:
// https://express1.ru/backend/frontend-log
//
// Тело запроса: { message: "лог" }
//
// Запуск:  node send-log.mjs

const url = "https://express1.ru/backend/frontend-log";

export function sendFrontendLog( message) {
  const url = "https://express1.ru/backend/frontend-log";

  try {
    const payload = { message };

     fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

  } catch (err) {
    console.error("Ошибка отправки лога:", err);
    throw err;
  }
}

sendFrontendLog("из логгера заработало");
