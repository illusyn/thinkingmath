@echo off
cd /d C:\Dev\websites\thinkingmath
git add .
git commit -m "Update site"
git push
echo.
echo Done! Changes pushed to server.
pause
