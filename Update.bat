@echo off
echo === Updating thinkingmath.org ===
echo.

cd /d C:\Dev\websites\thinkingmath

echo Current folder: %CD%
echo.

echo --- Git status ---
git status
echo.

git add .

git diff --cached --quiet
if %errorlevel%==0 (
  echo Nothing to commit - working tree clean.
  echo No push needed.
) else (
  echo --- Committing ---
  git commit -m "Update site"
  echo.
  echo --- Pushing to server ---
  git push
  echo.
  echo === Done! Site updated. ===
)
pause
