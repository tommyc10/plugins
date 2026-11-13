cp -R "$(dirname "$0")/fixture/." .
git init -q -b main && git add -A && git -c user.name=dev -c user.email=dev@example.com commit -qm "Start"
