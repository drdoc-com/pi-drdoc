import { drdocTools, getClient } from "./tools";
import { DrDocClient, DrDocConfig, msgLog, msgInfo, msgError } from "./drdoc-client";


/**
 * Registriert Dr.DOC Tools und Slash Commands im PI Agent Kontext.
 * 
 * @param pi - PI Extension Context
 */
export default function (pi: any): void {
  // Registrierung der Dr.DOC Werkzeuge
  for (const tool of drdocTools) {
    pi.registerTool(tool);
  }

  // Registrierung der Slash Commands

  // Login
  pi.registerCommand("drdoc_login", {
    description: "Benutzer anmelden in Dr.DOC über die REST API und speichert die Session: `/drdoc_login <baseUrl> <username> <password> <totp> <ignoreSSL:1,0>`",
    handler: async (args: string, ctx: any) => {
      // Entfernen leerer Strings nach dem String-Split
      const parts = args.trim().split(/\s+/); //.filter(Boolean);
      let [baseUrl, username, password, totp, ignoreSSL] = parts;

      if (!baseUrl)
        baseUrl = process.env.DRDOC_BASE_URL;

      if (!baseUrl || !username || !password) {
        msgError("Fehler: Syntax ist `/drdoc_login <baseUrl> <username> <password> <totp> <ignoreSSL:1,0>`");
        return;
      }

      try {
        //initializeDrDocClient({ baseUrl, username, password, totp, ignoreSSL });
        //const client = new DrDocClient({ baseUrl, username, password, totp, ignoreSSL });
        const client = await getClient({ baseUrl, username, password, totp, ignoreSSL: (ignoreSSL == '1' || ignoreSSL == 'true') }, true);
        if (process.env.DRDOC_DEBUG)
          msgLog('Client: ', client);

        /*const response = await client.signin(username, password, totp);

        if (response.HasError) {
          msgError(`Anmeldung fehlgeschlagen: ${response.Error?.Message}`);
          return;
        }

        msgInfo("Erfolgreich an Dr.DOC angemeldet. Die Session ist aktiv.");*/
      } catch (err: any) {
        msgError(`Fehler bei der Verbindung: ${err.message}`);
      }
    },
  });

  // Login
  pi.registerCommand("drdoc_logout", {
    description: "Benutzer abmelden aus Dr.DOC.",
    handler: async (args: string, ctx: any) => {
      const client = await getClient();
      client.signout();
    }
  });

  if (process.env.DRDOC_DEBUG) {
    // Test
    pi.registerCommand("drdoc_log_test", {
      description: "Log Test.",
      handler: async (args: string, ctx: any) => {
        const client = await getClient();
        msgLog('Log Test: ', client);
      }
    });
  }

}

export { DrDocClient, drdocTools };
