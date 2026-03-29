@echo off
echo === Updating thinkingmath.org ===
echo.

cd /d C:\Dev\websites\thinkingmath

echo Current folder: %CD%
echo.

echo --- Git status before commit ---
git status
echo.

git add .

echo --- Committing ---
git commit -m "Update site"

echo.
echo --- Pushing to server ---
git push

echo.
echo === Done! ===
pause
