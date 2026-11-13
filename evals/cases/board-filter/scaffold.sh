cp -R "$(dirname "$0")/fixture/." .
# The run has no network, so run.mjs installs the packages once into .eval-deps/ at the plugin root and each run copies them in.
deps="$(dirname "$0")/../../../.eval-deps/board-filter/node_modules"
if [ -d "$deps" ]; then cp -R "$deps" node_modules; else npm ci --silent --no-audit --no-fund; fi
git init -q -b main && git add -A && git -c user.name=dev -c user.email=dev@example.com commit -qm "Start"
