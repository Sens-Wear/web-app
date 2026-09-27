#!/usr/bin/env bash

# Install this file as /usr/local/bin/senswear-web-app-deploy. The dedicated
# SSH key is forced to this command, so it cannot open a shell on the instance.

set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 022

readonly deploy_root="/var/www/senswear-web-app"
readonly releases_directory="${deploy_root}/releases"
readonly incoming_directory="${deploy_root}/incoming"
readonly original_command="${SSH_ORIGINAL_COMMAND:-}"
readonly maximum_archive_bytes=$((50 * 1024 * 1024))
readonly maximum_extracted_bytes=$((100 * 1024 * 1024))
readonly maximum_archive_entries=20000

fail() {
  printf 'Deployment rejected: %s\n' "$1" >&2
  exit 1
}

if [[ "${original_command}" =~ ^(deploy|rollback)[[:space:]]+([0-9a-f]{40}-[0-9]+-[0-9]+)$ ]]; then
  action="${BASH_REMATCH[1]}"
else
  fail "invalid command"
fi

release_id="${BASH_REMATCH[2]}"
expected_revision="${release_id%%-*}"
archive_path="${incoming_directory}/${release_id}.tar.gz"
release_directory="${releases_directory}/${release_id}"
next_link="${deploy_root}/.current-${release_id}"
current_link="${deploy_root}/current"

[[ "$(id -u)" -ne 0 ]] || fail "the deploy command must not run as root"
[[ -d "${releases_directory}" ]] || fail "release directory is not initialized"
[[ -d "${incoming_directory}" ]] || fail "incoming directory is not initialized"

# Serialize activation and rollback even if a second SSH session connects.
exec 9>"${deploy_root}/.deploy.lock"
flock --wait 60 9 || fail "another deployment is in progress"

if [[ "${action}" == "rollback" ]]; then
  current_target="$(readlink "${current_link}")" ||
    fail "current release is not a symbolic link"
  [[ "${current_target}" == "releases/${release_id}" ]] ||
    fail "refusing to roll back a release that is not current"

  previous_marker="${release_directory}/.previous-release"
  if [[ ! -s "${previous_marker}" ]]; then
    rm -f -- "${current_link}"
    printf 'Withdrew first release %s; no previous release exists\n' \
      "${release_id}"
    exit 0
  fi

  previous_target="$(tr -d '\r\n' < "${previous_marker}")"
  [[ "${previous_target}" =~ ^releases/[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] ||
    fail "invalid rollback target"
  [[ -s "${deploy_root}/${previous_target}/index.html" ]] ||
    fail "rollback target is unavailable"

  rollback_link="${deploy_root}/.rollback-${release_id}"
  rm -f -- "${rollback_link}"
  ln -s "${previous_target}" "${rollback_link}"
  mv -Tf -- "${rollback_link}" "${current_link}"
  printf 'Rolled back %s to %s\n' "${release_id}" "${previous_target}"
  exit 0
fi

[[ ! -e "${release_directory}" ]] || fail "release already exists"
[[ ! -L "${release_directory}" ]] || fail "release path is a symbolic link"

activated=0
cleanup() {
  rm -f -- "${archive_path}" "${next_link}"
  if [[ "${activated}" -eq 0 && -d "${release_directory}" &&
    ! -L "${release_directory}" ]]
  then
    rm -rf -- "${release_directory}"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM

timeout 120 head --bytes "$((maximum_archive_bytes + 1))" > "${archive_path}"
[[ -s "${archive_path}" ]] || fail "empty archive"
archive_bytes="$(stat --format '%s' "${archive_path}")"
[[ "${archive_bytes}" -le "${maximum_archive_bytes}" ]] ||
  fail "archive exceeds 50 MiB"
tar --list --gzip --file "${archive_path}" > /dev/null

if tar --list --gzip --file "${archive_path}" |
  grep --extended-regexp '(^/|(^|/)\.\.(/|$))' > /dev/null
then
  fail "archive contains an unsafe path"
fi

if tar --list --verbose --gzip --file "${archive_path}" |
  awk '
    substr($1, 1, 1) != "-" && substr($1, 1, 1) != "d" { unsafe = 1 }
    END { exit unsafe ? 0 : 1 }
  '
then
  fail "archive contains a link or special file"
fi

if ! tar --list --verbose --gzip --file "${archive_path}" |
  awk \
    -v maximum_bytes="${maximum_extracted_bytes}" \
    -v maximum_entries="${maximum_archive_entries}" '
      {
        total_bytes += $3
        if (NR > maximum_entries || total_bytes > maximum_bytes) {
          exit 1
        }
      }
      END {
        if (NR > maximum_entries || total_bytes > maximum_bytes) {
          exit 1
        }
      }
    '
then
  fail "archive expands beyond the release limits"
fi

# Do not accept hidden configuration or the server-owned rollback marker.
if tar --list --gzip --quoting-style=literal --file "${archive_path}" |
  grep --extended-regexp '(^|/)\.[^./]' > /dev/null
then
  fail "archive contains a hidden file"
fi

mkdir -- "${release_directory}"
tar \
  --extract \
  --gzip \
  --file "${archive_path}" \
  --directory "${release_directory}" \
  --no-same-owner \
  --no-same-permissions

find "${release_directory}" -type d -exec chmod 0755 {} +
find "${release_directory}" -type f -exec chmod 0644 {} +

[[ -s "${release_directory}/index.html" ]] || fail "index.html is missing"
[[ -d "${release_directory}/assets" ]] || fail "asset directory is missing"
[[ -s "${release_directory}/revision.txt" ]] || fail "revision marker is missing"

deployed_revision="$(
  tr -d '\r\n' < "${release_directory}/revision.txt"
)"
[[ "${deployed_revision}" == "${expected_revision}" ]] ||
  fail "revision marker does not match the release"

if [[ -L "${current_link}" ]]; then
  previous_target="$(readlink "${current_link}")"
  [[ "${previous_target}" =~ ^releases/[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] ||
    fail "current release target is invalid"
  [[ -s "${deploy_root}/${previous_target}/index.html" ]] ||
    fail "current release target is unavailable"
  printf '%s\n' "${previous_target}" > \
    "${release_directory}/.previous-release"
elif [[ -e "${current_link}" ]]; then
  fail "current release path is not a symbolic link"
fi

ln -s "releases/${release_id}" "${next_link}"
mv -Tf -- "${next_link}" "${current_link}"
activated=1

printf 'Activated release %s\n' "${release_id}"
