@echo off
REM Windows shim — invokes the Node CLI with all args forwarded.
REM Usage: kanban list  /  kanban add "Title"  /  kanban done <id>  etc.
node "%~dp0kanban.mjs" %*
