#!/bin/sh
set -eu

release_dir=${CANVAS_WEB_RELEASE_DIR:-/opt/canvas-release}
html_dir=${CANVAS_WEB_HTML_DIR:-/usr/share/nginx/html}
retention_days=${CANVAS_WEB_ASSET_RETENTION_DAYS:-7}
case "$retention_days" in ''|*[!0-9]*|0) echo 'Invalid asset retention days' >&2; exit 1;; esac
test -s "$release_dir/index.html"

mkdir -p "$html_dir"
# One writer per volume. Kernel locks release after SIGKILL or a host restart;
# a persistent mkdir lock would leave the service stuck in a restart loop.
test ! -e "$html_dir/.canvas-publish-lock" || { echo 'Legacy publication lock exists; stop the old publisher and inspect it before upgrading' >&2; exit 1; }
exec 9>"$html_dir/.canvas-publish.lock"
flock -n 9 || { echo 'Another publication is active' >&2; exit 1; }
# A killed publisher cannot run its trap. Only its private staging directories
# are disposable; the lock excludes an active writer on this volume.
find "$html_dir" -mindepth 1 -maxdepth 1 -type d -name '.canvas-stage.*' -exec rm -rf {} +
stage=''
cleanup() { test -z "$stage" || rm -rf "$stage"; flock -u 9; exec 9>&-; }
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
stage=$(mktemp -d "$html_dir/.canvas-stage.XXXXXX")
cp -R "$release_dir/." "$stage/"
test -d "$stage/assets"
(cd "$stage" && find assets -type f | LC_ALL=C sort) > "$stage/.canvas-assets"

# Publish complete files by rename on the same filesystem. HTML is switched last.
# Batch by directory rather than spawning several processes for every chunk.
# Each mv still renames complete files atomically on this volume. Fresh staging
# copies also refresh their retention age without a separate touch per file.
find "$stage" -type d -print0 | xargs -0 -r sh -ec '
    stage=$1; html=$2; shift 2
    for directory do
        target="$html${directory#"$stage"}"
        mkdir -p "$target"
        find "$directory" -maxdepth 1 -type f ! -path "$stage/index.html" ! -path "$stage/.canvas-assets" -print0 |
            xargs -0 -r sh -ec '\''target=$1; shift; mv -f "$@" "$target/"'\'' publish-files "$target"
    done
' publish-directories "$stage" "$html_dir"
if test -f "$html_dir/.canvas-assets-current" && ! cmp -s "$stage/.canvas-assets" "$html_dir/.canvas-assets-current"; then
    cp "$html_dir/.canvas-assets-current" "$html_dir/.canvas-assets-previous"
fi
mv -f "$stage/index.html" "$html_dir/index.html"
mv -f "$stage/.canvas-assets" "$html_dir/.canvas-assets-current"

# Retain current + previous builds unconditionally, and older chunks for 7 days.
# Only prune hashed assets, never application data or non-asset public files.
find "$html_dir/assets" -type f -mtime +"$retention_days" | while IFS= read -r file; do
    relative=${file#"$html_dir/"}
    if grep -Fxq "$relative" "$html_dir/.canvas-assets-current" || { test -f "$html_dir/.canvas-assets-previous" && grep -Fxq "$relative" "$html_dir/.canvas-assets-previous"; }; then
        continue
    fi
    rm -f "$file"
done
cleanup
trap - EXIT HUP INT TERM

exec nginx -g 'daemon off;'
