# Deploy app.sens-wear.com to AWS Lightsail

This uses the same release-archive, restricted-SSH, Nginx and atomic-symlink approach
as SensWear QuickStart. It has its own **webapp-deploy** account, key, receiver,
directory and virtual host. The existing QuickStart account/key is restricted to
QuickStart and cannot deploy this app. Do not put an administrative Lightsail key
in GitHub Actions.

After the one-time server and secret setup below, every update to `main` in
`Sens-Wear/web-app` builds, tests and deploys to **https://app.sens-wear.com**.
The workflow also validates pull requests, without production secrets or deployment.
`workflow_dispatch` can retry a deployment on `main`; other branches cannot deploy.
No AWS access key, PAT, public webhook listener, or Node installation on Lightsail
is needed. The browser app contains no deployment credentials.

## One-time setup status

The repository's `production` environment has been created with an explicit `main`
branch rule. Deployment credentials and server provisioning remain to be supplied;
they are not part of the public repository.

Pushing the repository creates the workflow; it does not configure the server or
copy secrets from another GitHub repository. These prerequisites must exist before
the deployment job can succeed. Missing secrets cause an explicit failed job.

- Nginx must serve this app's `current` directory for `app.sens-wear.com`.
- The restricted receiver and **webapp-deploy** account must be installed.
- HTTPS and the DNS record must point at the intended Lightsail instance.
- The `production` GitHub environment must allow only the `main` branch and contain
  the four secrets listed below.

Use the existing Ubuntu/Nginx Lightsail server if that is the intended host. The app
can coexist with QuickStart because it uses a different virtual host and directory.
Confirm the actual static IP in Lightsail; do not infer it from the proxied Cloudflare
address or assume QuickStart's documented address is still correct.

## 1. Install the restricted deployment receiver

Use the Lightsail browser terminal or an existing administrative SSH connection.
The following are **one-time administrator commands**, not commands run by Actions:

```bash
sudo adduser --disabled-password --gecos "" webapp-deploy
sudo install -d -o webapp-deploy -g webapp-deploy -m 0755 /var/www/senswear-web-app
sudo -u webapp-deploy install -d -m 0755 \
  /var/www/senswear-web-app/incoming \
  /var/www/senswear-web-app/releases
```

The server needs Bash, GNU tar/coreutils, `flock` (util-linux), OpenSSH and Nginx;
these command-line tools are standard on Ubuntu. The receiver must never run as
root, and the deployment account needs no `sudo` permission.

Transfer the receiver and virtual-host file as files, rather than pasting their
contents into a terminal. From Windows PowerShell in this repository:

```powershell
$lightsailIp = Read-Host 'Confirmed Lightsail static IPv4 address'
$adminUser = Read-Host 'Existing administrative SSH username'
$adminKey = Read-Host 'Full path to the existing administrative private key'
scp -i $adminKey .\deploy\receive-release.sh "${adminUser}@${lightsailIp}:/tmp/webapp-receive-release.sh"
scp -i $adminKey .\deploy\nginx\app.sens-wear.com.conf "${adminUser}@${lightsailIp}:/tmp/app.sens-wear.com.conf"
Get-FileHash .\deploy\receive-release.sh -Algorithm SHA256
```

Compare the SHA256 with `sha256sum /tmp/webapp-receive-release.sh` on the server,
then validate and install the receiver as root-owned:

```bash
bash -n /tmp/webapp-receive-release.sh
sudo install -o root -g root -m 0755 \
  /tmp/webapp-receive-release.sh /usr/local/bin/senswear-web-app-deploy
```

Create a new key on a trusted local computer, **outside this repository**:

```powershell
ssh-keygen -t ed25519 -C 'github-actions SensWear Web App' -f "$env:USERPROFILE\.ssh\webapp-lightsail-deploy"
```

Leave the passphrase empty for this restricted automation key. Keep its private
part on the trusted computer and in the GitHub environment secret. On Lightsail,
install **only the public key** in a root-owned authorized-keys file:

```bash
sudo install -d -o root -g root -m 0755 /home/webapp-deploy/.ssh
sudo touch /home/webapp-deploy/.ssh/authorized_keys
sudo chown root:root /home/webapp-deploy /home/webapp-deploy/.ssh/authorized_keys
sudo chmod 0755 /home/webapp-deploy
sudo chmod 0644 /home/webapp-deploy/.ssh/authorized_keys
sudoedit /home/webapp-deploy/.ssh/authorized_keys
```

Add exactly one line, replacing `AAAA...` with the generated public key:

```text
restrict,command="/usr/local/bin/senswear-web-app-deploy" ssh-ed25519 AAAA... github-actions SensWear Web App
```

The root-owned home and SSH files prevent the deployment account from changing
its authorization. `restrict` disables forwarding, PTY and user RC files; the forced
receiver permits only validated `deploy <commit>-<run>-<attempt>` and corresponding
`rollback` commands. It does not provide an interactive shell, SCP or SFTP.
Keep password login disabled for this account and do not add unrestricted keys.

## 2. Configure only this app's Nginx virtual host

Inspect the existing configuration with `sudo nginx -T`. If an `app.sens-wear.com`
server block already exists, update that block instead of enabling a duplicate;
preserve any valid TLS certificate configuration. Do not replace Nginx's global
configuration or QuickStart's virtual host.

For a new app virtual host:

```bash
sudo install -o root -g root -m 0644 /tmp/app.sens-wear.com.conf \
  /etc/nginx/sites-available/app.sens-wear.com.conf
sudo ln -s /etc/nginx/sites-available/app.sens-wear.com.conf \
  /etc/nginx/sites-enabled/app.sens-wear.com.conf
sudo nginx -t
sudo systemctl reload nginx
```

The supplied file initially listens on HTTP. It serves only
`/var/www/senswear-web-app/current`, blocks hidden files, disables caching for the
HTML/revision marker, caches hashed scripts/styles, and sets CSP, content-type,
framing and Permissions-Policy headers. Bluetooth is explicitly allowed for this
origin. Inline **styles** are permitted for React's dynamic controls; inline scripts
are not. Cross-origin embedding requires an intentional change to both framing
headers and Bluetooth policy.

## 3. Confirm DNS, HTTPS and the firewall

In Cloudflare, the `app` A record must target the intended Lightsail static IPv4
address. Do not change apex, `www`, or `qs` records. Only publish an AAAA record if
the origin's IPv6 is deliberately configured. For a new certificate, temporarily
use DNS-only mode for `app`, allow TCP 80/443, and use Certbot on the Nginx host:

```bash
sudo certbot --nginx -d app.sens-wear.com --redirect
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

If Certbot is not installed on this Ubuntu host, install `certbot` and
`python3-certbot-nginx` first. An existing certificate that already covers this
hostname can be preserved. Verify the origin directly before enabling the proxy:

```bash
curl --resolve app.sens-wear.com:443:CONFIRMED_STATIC_IP https://app.sens-wear.com/
```

A 404 is expected until the first release exists; TLS must still validate. When
Cloudflare is proxied, use **Full (strict)** for this hostname and bypass any
cache-everything rule for its HTML and `/revision.txt`. Avoid changes to zone-wide
TLS settings that would affect the other sites. Never use Flexible mode with an
HTTPS-redirecting origin.

Actions connects to the **origin's static IP**, not the Cloudflare-proxied hostname.
The workflow uses SSH port 22. Ensure the Lightsail and OS firewalls allow that
connection. Standard hosted runners have changing outbound IPs. If a fixed SSH
source allowlist is required, use a hosted larger runner with a static IP and
update `runs-on`; do not run untrusted public pull requests on this production
server or a privileged self-hosted runner.

## 4. Configure the GitHub production environment

Open [web-app settings](https://github.com/Sens-Wear/web-app/settings/environments),
create **production**, choose **Selected branches and tags**, and add a **Branch**
rule for `main` only. Do not allow tags or pull-request refs. Leave required
reviewers disabled for automatic deployment after each `main` update.

Create these **environment secrets**, with the same names as QuickStart but values
for this app's dedicated account and key:

| Secret                      | Value                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `LIGHTSAIL_HOST`            | Confirmed origin static IPv4 address or direct SSH hostname, without protocol or port.                                  |
| `LIGHTSAIL_USER`            | `webapp-deploy`                                                                                                         |
| `LIGHTSAIL_SSH_PRIVATE_KEY` | Complete private key from the new `webapp-lightsail-deploy` file, not its `.pub` file and not the admin/QuickStart key. |
| `LIGHTSAIL_KNOWN_HOSTS`     | Verified OpenSSH known-hosts entry for exactly `LIGHTSAIL_HOST`.                                                        |

Obtain the public host key through the **trusted Lightsail browser terminal**:

```bash
LIGHTSAIL_STATIC_IP='REPLACE_WITH_CONFIRMED_STATIC_IP'
sudo awk -v ip="$LIGHTSAIL_STATIC_IP" '{print ip, $1, $2}' /etc/ssh/ssh_host_ed25519_key.pub
sudo ssh-keygen -E sha256 -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Use the first line (`IP ssh-ed25519 BASE64_KEY`) for `LIGHTSAIL_KNOWN_HOSTS`, after
checking the displayed fingerprint against the trusted server. The fingerprint
alone is not a known-hosts entry. Do not use an unverified `ssh-keyscan` result or
disable host checking. If both sites use the same confirmed instance, the host/IP
and host-key values can match QuickStart; the account and private key must differ.

GitHub does not copy secrets between repositories or reveal existing secret values.
Paste the private key only into GitHub's secret field, never a commit, issue, log,
chat or `VITE_*` variable. The `.gitignore` excludes common credential filenames,
but always review staged files before making a public commit.

Protect `main` with a ruleset requiring pull-request review and the **Build and
verify** check before merging, with restricted bypass access. Review workflow and
dependency changes carefully. Dependabot opens update PRs for pinned Actions and npm
packages; it does not auto-merge them. Workflow code cannot itself enforce repository
rulesets or environment branch restrictions, so configure these in Settings.

## Operation and rollback

Push to `main`, or use **Actions > Deploy Web App to Lightsail > Run workflow** on
`main` after completing setup. The workflow:

1. Installs locked dependencies with lifecycle scripts disabled on an isolated runner.
2. Runs type checking, unit tests, Linux receiver tests, a production build and
   desktop/mobile Chromium tests against that build.
3. Uploads only the static release as an artifact retained for one day.
4. Uses a separate credential-bearing job with no source checkout or npm execution.
5. Sends the archive to the restricted receiver, which validates paths, types,
   revision and size, and atomically switches `current`.
6. Checks the public HTTPS revision and app HTML. On failure it requests a guarded
   rollback, including withdrawal of a failed first release if no prior release exists.
7. Removes the temporary SSH files from the runner.

GitHub Actions are pinned to full commit SHAs; checkout does not persist a GitHub
credential. The workflow avoids `pull_request_target`, elevated GitHub token
permissions and third-party SSH actions. Deployments are serialized; an older
queued run is skipped if `main` has advanced. The server also locks activation
and rollback to avoid simultaneous changes. A newer commit pushed during an active
deployment will deploy after it; rollback never overwrites a different current release.

Layout:

```text
/var/www/senswear-web-app/
  current -> releases/<commit>-<run>-<attempt>
  incoming/
  releases/
```

To roll back a specific currently deployed release from the administrator's server
session, first inspect `readlink /var/www/senswear-web-app/current`, then replace the
placeholder with that exact release ID:

```bash
sudo -u webapp-deploy env SSH_ORIGINAL_COMMAND='rollback EXACT_CURRENT_RELEASE_ID' \
  /usr/local/bin/senswear-web-app-deploy
```

The receiver refuses rollback if that release is no longer current. It restores
the previously recorded release. Rollback requires a working SSH connection; a
network outage or terminated runner may need this administrative recovery command.
If the first deployment fails verification, removing `current` makes the app return
404 until corrected and redeployed.

Old releases are retained for recovery, not automatically deleted. Monitor disk space
and remove only confirmed inactive releases during maintenance, retaining `current`
and its `.previous-release` target. Per-release limits are 50 MiB compressed,
100 MiB unpacked and 20,000 archive entries. Rotate this app's deploy key independently
of QuickStart's key.

## References

- [GitHub Actions security guidance](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- [AWS Lightsail SSH](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-ssh-using-terminal.html)
- [OpenSSH restricted keys and forced commands](https://man.openbsd.org/sshd.8#AUTHORIZED_KEYS_FILE_FORMAT)
- [Nginx header inheritance](https://nginx.org/en/docs/http/ngx_http_headers_module.html)
