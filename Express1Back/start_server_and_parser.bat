@echo off
REM Запуск сервера
start "Express Server" cmd /k "node server.mjs"
REM Запуск парсера
start "Parser" cmd /k "node index.mjs" 
REM Запуск results парсера
start "Results Parser" cmd /k "node results_parser.mjs" 