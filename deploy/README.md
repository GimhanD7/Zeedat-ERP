# Deploy ZEEDAT POS to Namecheap

The GitHub Actions workflow builds the web app on pull requests and pushes to `main`. With deployment enabled, a push to `main` or a manual run on `main` uploads a release over SSH and checks the HTTPS site and session API.

## Prepare cPanel once

1. Create a dedicated subdomain, such as `pos.example.com`, with its own empty document root. Record its full path from cPanel and enable HTTPS for the subdomain. Select PHP 8.2 or newer with PDO MySQL, mbstring, bcmath and cURL. Enable SSH via **Manage Shell** and verify that `php -v` in cPanel Terminal also reports PHP 8.2 or newer. [Domains](https://www.namecheap.com/support/knowledgebase/article.aspx/10125/29/how-to-manage-domains-in-cpanel/) · [SSH access](https://www.namecheap.com/support/knowledgebase/article.aspx/10040/2210/how-to-enable-ssh-shell-in-cpanel/) · [PHP extensions](https://www.namecheap.com/support/knowledgebase/article.aspx/9697/2219/php-modules-limits-and-extensions-on-shared-hosting-servers/)
2. Create a MySQL database and user with **Database Wizard**. Record both names including the cPanel prefixes. In phpMyAdmin, select the new database and import a copy of `database/schema.sql` with its first two statements (`CREATE DATABASE` and `USE`) removed. For an existing database, back it up and apply any missing schema changes before deployment. [Database Wizard](https://www.namecheap.com/support/knowledgebase/article/9363/2180/how-to-create-and-maintain-databases-in-cpanel/) · [phpMyAdmin import](https://www.namecheap.com/support/knowledgebase/article.aspx/9540/2180/how-to-manage-databases-with-phpmyadmin/)
3. In cPanel Terminal, run `mkdir -m 700 -p "$HOME/.zeedat"` and create `$HOME/.zeedat/config.php` with the following contents. Use the actual DB host and account details, then run `chmod 600 "$HOME/.zeedat/config.php"`.

   ```php
   <?php
   return [
       'DB_HOST' => 'localhost',
       'DB_PORT' => '3306',
       'DB_NAME' => 'cpaneluser_zeedat',
       'DB_USER' => 'cpaneluser_zeedat',
       'DB_PASSWORD' => 'replace-with-the-database-password',
   ];
   ```

4. Generate a dedicated deployment SSH key. Import its public key under cPanel **SSH Access → Manage SSH Keys** and authorize it. Use a key that GitHub Actions can unlock non-interactively. Obtain the server's verified SSH host key and format it as a `known_hosts` line, such as `[server.example.com]:21098 ssh-ed25519 <verified-key>`. Confirm the fingerprint against a trusted value from your hosting provider. [Namecheap SSH key setup](https://www.namecheap.com/support/knowledgebase/article.aspx/9428/89/how-to-connect-via-ssh-using-keys/)

## Link GitHub

In **Settings → Secrets and variables → Actions**, create these repository secrets. [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)

| Secret | Value |
| --- | --- |
| `NAMECHEAP_SSH_KEY` | Full private key for the authorized deployment key |
| `NAMECHEAP_KNOWN_HOSTS` | Verified SSH host key line |

Create these repository variables in the **Variables** tab.

| Variable | Example |
| --- | --- |
| `NAMECHEAP_HOST` | `server.example.com` from cPanel Server Information |
| `NAMECHEAP_PORT` | `21098` for Namecheap shared hosting, which is the default |
| `NAMECHEAP_USER` | Your cPanel username |
| `NAMECHEAP_WEB_ROOT` | `/home/cpaneluser/pos.example.com` using the exact cPanel path |
| `NAMECHEAP_SITE_URL` | `https://pos.example.com` |
| `NAMECHEAP_DEPLOY_ENABLED` | `true` when the host and database are ready |

Push the pipeline to `main`, or select **Actions → Build and deploy to Namecheap → Run workflow** once the pipeline is on `main`. The SSH account needs Bash, tar and standard GNU file utilities. This layout supports one ZEEDAT deployment per cPanel account.

## Create the first owner

After the first successful deploy to a new database, run this in cPanel Terminal. Use an email and a unique password of at least 12 characters.

```bash
read -rp 'Owner email: ' ZEEDAT_OWNER_EMAIL
read -rsp 'Owner password: ' ZEEDAT_OWNER_PASSWORD; printf '\n'
export ZEEDAT_OWNER_EMAIL ZEEDAT_OWNER_PASSWORD
php -d auto_prepend_file="$HOME/.zeedat/current/deploy/hosted-config.php" \
  "$HOME/.zeedat/current/database/setup.php"
unset ZEEDAT_OWNER_EMAIL ZEEDAT_OWNER_PASSWORD
```

Open the HTTPS subdomain and sign in. Releases and backups live under `$HOME/.zeedat`. The web root contains the built frontend and a small PHP entry point.

Each successful deployment publishes the web app and a versioned desktop update from the same commit. GitHub Actions verifies the live homepage, PHP session API, update manifest, and archive checksum. Open web tabs offer a reload when a new frontend is available.

The current Windows installer and portable EXE check the ZEEDAT site at startup and every 15 minutes. They download and verify newer React/PHP updates in the background and activate them on the next launch. The local database and backups live outside the update folders. Install or replace the desktop executable once to get the updater changes. Updates to the Windows launcher, Electron shell, or bundled PHP runtime require a new executable.
