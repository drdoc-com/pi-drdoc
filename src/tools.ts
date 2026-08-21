import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { DrDocClient, DrDocConfig, msgLog, msgInfo, msgError } from "./drdoc-client";

let clientInstance: DrDocClient | null = null;

/**
 * Hilfsfunktion zum Abrufen der initialisierten Instanz.
 */
export async function getClient(config: DrDocConfig = {} as DrDocConfig, force: Boolean = false): Promise<DrDocClient> {
  if (!clientInstance || force) {
    if (process.env.DRDOC_DEBUG)
      msgInfo('getClient: init instance');
    clientInstance = new DrDocClient(config);

    // Verbindung testen
    if (await clientInstance.state()) {
      msgInfo('Bereits in Dr.DOC angemeldet. Die Session ist aktiv.');
    }
    else {
      const response = await clientInstance.signin(config.username, config.password, config.totp);
      if (response.HasError)
        throw new Error("getClient: DrDocClient ist nicht initialisiert. Bitte vorher den Befehl /drdoc_login ausführen.");

      msgInfo("Erfolgreich an Dr.DOC angemeldet. Die Session ist aktiv.");

      // Verbindung testen
      /*if (await clientInstance.state())
        msgInfo('getClient: state ok');
      else {

      }*/
    }
  }
  return clientInstance;
}

/**
 * Hilfsfunktion zur Formatierung von Werkzeug-Antworten für das PI Framework.
 * Garantiert stets ein definiertes 'content'-Array im Ergebnis.
 */
function formatToolResult(data: any, isError: boolean = false) {
  const safeData = data ?? "";
  const textContent = typeof safeData === "string" ? safeData : JSON.stringify(safeData, null, 2);
  return {
    content: [
      {
        type: "text",
        text: isError ? `Fehler: ${textContent}` : textContent,
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

/**
 * Führt eine Werkzeug-Aktion sicher aus und fängt Ausnahmen ab,
 * um stets ein valides PI-Antwortformat zu garantieren.
 */
async function safeExecute<T>(fn: () => Promise<T>) {
  try {
    const result = await fn();
    return formatToolResult(result);
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    msgError(errorMessage);
    return formatToolResult(errorMessage, true);
  }
}

/**
 * Für Tool Execute Aufrufe für Client-basierte Werkzeuge.
 * Überprüft das Vorhandensein aller Pflichtparameter, ruft die 'DrDocClient'-Instanz ab
 * und führt die Ziel-Funktion innerhalb von 'safeExecute' aus.
 *
 * @param requiredParams Liste der erforderlichen Parameter-Namen.
 * @param args Die vom Tool empfangenen Argumente.
 * @param fn Auszuführende Funktion mit dem initialisierten Client und den Argumenten.
 */
export function safeExecuteClient<A extends Record<string, any> = Record<string, any>, T = any>(
  requiredParams: (keyof A & string)[],
  args: A | undefined,
  fn: (client: DrDocClient, safeArgs: A) => Promise<T>
) {
  return safeExecute(async () => {
    const safeArgs = (args || {}) as A;

    // Überprüfung aller erforderlichen Parameter
    const missing = requiredParams.filter(
      (param) => safeArgs[param] === undefined || safeArgs[param] === null || safeArgs[param] === ""
    );

    if (missing.length > 0) {
      throw new Error(`Fehlende Pflichtparameter: ${missing.join(", ")} müssen angegeben werden.`);
    }

    // Abruf der Client-Instanz und Ausführung der Logik
    const client = await getClient();
    return await fn(client, safeArgs);
  });
}

/**
 * Werkzeug-Definitionen für das PI Agent Framework.
 */
export const drdocTools = [
  {
    name: "drdoc_login_2",
    description: "Meldet den Benutzer in Dr.DOC über die REST API an.",
    parameters: {
      type: "object",
      properties: {
        baseUrl: { type: "string", description: "Basis-URL der Dr.DOC Instanz (z. B. https://drdoc.com)" },
        username: { type: "string", description: "Benutzername" },
        password: { type: "string", description: "Passwort" },
        totp: { type: "string", description: "TOTP F2A" },
        ignoreSSL: { type: "boolean", description: "SSL-Zertifikatsprüfung ignorieren" },
      },
      required: ["baseUrl", "username", "password"],
    },
    execute: async (toolCallId: string, args?: { baseUrl?: string; username?: string; password?: string; totp?: string; ignoreSSL?: boolean }) => {
      return safeExecute(async () => {
        const safeArgs = args || {};
        if (!safeArgs.baseUrl || !safeArgs.username || !safeArgs.password) {
          throw new Error("Fehlende Pflichtparameter: baseUrl, username und password müssen angegeben werden.");
        }
        // getClient mit force: true zur Neu-Initialisierung
        const client = await getClient({
          baseUrl: safeArgs.baseUrl,
          username: safeArgs.username,
          password: safeArgs.password,
          totp: safeArgs.totp,
          ignoreSSL: safeArgs.ignoreSSL,
        }, true);
        return await client.signin(safeArgs.username, safeArgs.password, safeArgs.totp);
      });
    },
  },
  {
    name: "drdoc_properties_fields",
    description: "Liste aller Dr.DOC Felder (Feldnamen) im Dr.DOC Archiv. Diese Funktion **muss** vor 'drdoc_search_fields' aufgerufen werden.",
    parameters: {
      type: "object",
      properties: {
        archive: { type: "string", description: "Name des Dr.DOC Ziel-Archivs" },
      },
      required: ["archive"],
    },
    execute: async (toolCallId: string, args?: { archive?: string }) => {
      if (process.env.DRDOC_DEBUG)
        msgLog('drdoc_properties_fields:', args);
      return safeExecuteClient(["archive"], args, async (client, safeArgs) => {
        const defNameArray = ['STD_AI_INVOICE_IN', 'DD_FIELD_DESC', 'STD_FIELD_DESC'];
        for (let defName of defNameArray) {
          const fs = await client.getFieldSelection(safeArgs.archive, "IMPORT_ASCII", defName);
          if (process.env.DRDOC_DEBUG)
            msgLog('props:', fs);
          if (!fs.HasError && fs.Result)
            return fs.Result;
        }
        return {};
      });
    },
  },
  {
    name: "drdoc_search_fields",
    description: `Führt eine feldspezifische Suche (Feldsuche oder Filtersuche) in einem Dr.DOC Archiv durch.
Du **musst** zuerst alle Dr.DOC Feldnamen durch 'drdoc_properties_fields' abrufen, und erst danach 'drdoc_search_fields', damit Du weißt in welchen Feldern Du suchen musst.

Diese Suche sollte verwendet werden, wenn nach Bereichen oder bestimmten Feldwerten gesucht werden soll (z.B. Firma "*Amazon*" und Datum "%DY%").
Es kann je Feld eine Suchbedingung bzw. Suchtext eingegeben werden.
Es wird nur in den angegebenen Feldern gesucht.
Dokumentation für Suchbedingung / Suchfilter im Parameter value:
Suchfelder und Suchwerte (flache key-value-pair Liste). Die Datensätze werden danach gefiltert.
Der Feld-Suchtext bzw. Suchbedingung greift nur für die hier angegebenen Felder.
Die Suchoperatoren müssen ohne Leerzeichen verkettet werden, also ohne Leerzeichen direkt an die Suchbegriffe angehängt werden (bzw. für NOT-Operator vorangestellt werden).
Suchoperatoren:
- * für gefüllte Felder
- *TEXT* für enthält Feldwert TEXT bzw. trunktierte Suche
- & als logischer AND Operator
- "|" (Pippe) als logischer OR Operator
- ! als logischer NOT Operator als Prefix, muss dem Suchbegriff vorangestellt werden.
- !* für leere Felder
- <-> für Datumsbereich, Zeitraum, Bereichssuche, Zahlenbereich; A<->B von A bis einschließlich B; Format für Datumsbereich: DD.MM.YYYY<->DD.MM.YYYY z.B. 01.07.2024<->31.07.2024.
Beispiele für Suchoperatoren:
- *TEXT* für trunkierte/Substring Suche nach TEXT (Feldwert enthält TEXT), MUSS zwingend bei unklaren/ungenauen/unspezifischen Eingaben verwendet werden!
- !*TEXT* für Feldwert enthält TEXT nicht
- !* für leeren, nicht gefüllte Feldwerte
- !TEXT für alle Feldwerte, abgesehen von TEXT bzw. alles bis auf TEXT.
- !A&B für exakte Suche nach B jedoch ohne A
- "A|B" (Pippe) für exakte Suche nach A oder B
- !*A*&*B* für Suche nach enthält (Substring) B aber enthält kein A
- 01.01.2020<->31.12.2020 für Datumssuchbereichs-Suche (Bereichssuche) vom 01.01.2020 bis einschließlich 31.12.2020 (1 Jahr)
- 01.07.2024<->31.07.2024 für Datumssuchbereichs-Suche (Bereichssuche) vom 01.07.2024 bis einschließlich 31.07.2024 für den Monat Juli 2024 (1 Monat)
Datumsformat: DD.MM.YYYY
Zahlenformat: 0.00
Variablen:
- %DY% Variable für Datumsbereich im aktuellen/diesen Jahr (wird z.B. zu: *.2021)
- %DMY% Variable für Datumsbereich im aktuellen/diesen Monat (wird z.B. zu: *.01.2021)
- %DWY% Variable für Datumsbereich in der aktuellen/diesen Woche (7 Tage)
- %B% Variable für angemeldeten Benutzer
- %D% Variable für aktuelles Datum (heutiger Tag)
- %D-1% Variable für gestriges Datum bzw. gestern
- %D-2% Variable für vorgestern
- %D+1% Variable für morgiges Datum bzw. morgen
- %D+2% Variable für übermorgen
Beispiel: Filter für alle Eingangsrechnungen im Zeitraum Juli 2024 (01.07.2024 bis einschließlich 31.07.2024) von Firma Amazon:
{ date: "01.07.2024<->31.07.2024", c_company: "*Amazon*", inout: "0", type: "Rechnung" }
    `,
    parameters: {
      type: "object",
      properties: {
        archive: { type: "string", description: "Name des Archivs" },
        searchValues: {
          type: "object",
          description: "Key-Value Paare für die Feldsuche. Der Key muss Exakt einem Dr.DOC Feldnamen entsprechen (durch das Tool 'drdoc_properties_fields'). Unterstützt Operatoren wie *TEXT*, !*, A<->B",
        },
        selection: { type: "string", description: "Mit Semikolon getrennte Liste auszugebender Felder" },
        count: { type: "number", description: "Maximale Trefferanzahl" },
      },
      required: ["archive", "searchValues"],
    },
    execute: async (toolCallId: string, args?: { archive?: string; searchValues?: Record<string, any>; selection?: string; count?: number }) => {
      if (process.env.DRDOC_DEBUG)
        msgLog('drdoc_search_fields:', args);
      return safeExecuteClient(["archive", "searchValues"], args, async (client, safeArgs) => {
        return await client.searchFields(safeArgs.archive, safeArgs.searchValues, {
          selection: safeArgs.selection,
          count: safeArgs.count,
        });
      });
    },
  },
  {
    name: "drdoc_search_fulltext",
    description: `Führt eine Volltextsuche (Text Retrieval, Freitextsuche, Volltextsuche, Text Retrieval, Full-Text-Search) über alle Felder und Metadaten eines Dr.DOC Archivs durch.
Die Bedeutung der Felder erhältst Du durch das Tool 'drdoc_properties_fields'.

Diese Suche sollte verwendet werden, wenn im Dokumenttext bzw. allen Feldwerten gesucht werden soll, unabhängig davon wo der Text im Dr.DOC Archiv zu finden ist.
Es muss eine Suchbedingung bzw. Suchtext eingegeben werden, ohne Feldname.
Es wird eine Suchergebnisliste von vorgefilterten Datensätzen zurückgegeben.
Suchtext (bzw. Suchbedingung). Die zurückgegebenen Datensätze werden nach diesem Suchtext gefiltert.
Es soll der Suchtext ohne Feldname angegeben werden. " +Der Suchtext greift für alle Dr.DOC Felder (Volltextsuche), also unabhängig in welchem Feld der Text gefunden wird.
Die Suchoperatoren müssen ohne Leerzeichen verkettet werden, also ohne Leerzeichen direkt an die Suchbegriffe angehängt werden (bzw. für NOT Operator vorangestellt werden).
Suchoperatoren:
- & als logischer AND Operator
- "|" (Pipe) als logischer OR Operator
- ! als logischer NOT Operator als Prefix, muss dem Suchbegriff vorangestellt werden.
Beispiele für Suchoperatoren:
- !A&B für Suche nach B jedoch ohne A
- "A|B" für Suche nach A oder B
Datumsformat: DD.MM.YYYY
`,
    parameters: {
      type: "object",
      properties: {
        archive: { type: "string", description: "Name des Archivs" },
        queryText: { type: "string", description: "Suchtext oder Suchbedingung" },
        selection: { type: "string", description: "Mit Semikolon getrennte Liste auszugebender Felder" },
        count: { type: "number", description: "Maximale Trefferanzahl" },
      },
      required: ["archive", "queryText"],
    },
    execute: async (toolCallId: string, args?: { archive?: string; queryText?: string; selection?: string; count?: number }) => {
      if (process.env.DRDOC_DEBUG)
        msgLog('drdoc_search_fulltext:', args);
      return safeExecuteClient(["archive", "queryText"], args, async (client, safeArgs) => {
        return await client.textRetrieval(safeArgs.archive, safeArgs.queryText, {
          selection: safeArgs.selection,
          count: safeArgs.count,
        });
      });
    },
  },
  {
    name: "drdoc_get_record",
    description: "Liest einen konkreten Meta-Datensatz anhand seiner ID aus. Die Bedeutung der Felder erhältst Du durch das Tool 'drdoc_properties_fields'.",
    parameters: {
      type: "object",
      properties: {
        archive: { type: "string", description: "Name des Dr.DOC Archivs" },
        id: { type: "string", description: "Datensatz-ID (DrDocGUID oder Dokument-Nr.)" },
        idField: { type: "string", description: "Optionaler Feldname für die ID" },
      },
      required: ["archive", "id"],
    },
    execute: async (toolCallId: string, args?: { archive?: string; id?: string; idField?: string }) => {
      return safeExecuteClient(["archive", "id"], args, async (client, safeArgs) => {
        return await client.getRecord(safeArgs.archive, safeArgs.id, safeArgs.idField);
      });
    },
  },
  {
    name: "drdoc_create_record",
    description: "Erstellt einen neuen Meta-Datensatz in einem Dr.DOC Archiv. Die Bedeutung der Felder erhältst Du durch das Tool 'drdoc_properties_fields'.",
    parameters: {
      type: "object",
      properties: {
        archive: { type: "string", description: "Name des Dr.DOC Ziel-Archivs" },
        value: { type: "object", description: "JSON-Objekt mit den Feldinhalten" },
      },
      required: ["archive", "value"],
    },
    execute: async (toolCallId: string, args?: { archive?: string; value?: Record<string, any> }) => {
      return safeExecuteClient(["archive", "value"], args, async (client, safeArgs) => {
        return await client.createRecord(safeArgs.archive, safeArgs.value);
      });
    },
  },
  /*{
    name: "drdoc_get_document",
    description: "Liest ein Dokumenteninhalt (Blob) anhand seiner ID aus.",
    parameters: {
      type: "object",
      properties: {
        archive: { type: "string", description: "Name des Dr.DOC Archivs" },
        id: { type: "string", description: "Datensatz-ID (DrDocGUID oder Dokument-Nr.)" },
        idField: { type: "string", description: "Optionaler Feldname für die ID" },
      },
      required: ["archive", "id"],
    },
    execute: async (toolCallId: string, args?: { archive?: string; id?: string; idField?: string }) => {
      return safeExecuteClient(["archive", "id"], args, async (client, safeArgs) => {
        return await client.getDocument(safeArgs.archive, safeArgs.id, safeArgs.idField);
      });
    },
  },*/

  {
    name: "drdoc_get_document",
    description: "Liest den Dokumenteninhalt (Blob) anhand der ID aus, speichert die Datei lokal und bereitet sie für die Anzeige im Pi Agent auf.",
    parameters: {
      type: "object",
      properties: {
        archive: { type: "string", description: "Name des Dr.DOC Archivs" },
        id: { type: "string", description: "Datensatz-ID (DrDocGUID oder Dokument-Nr.)" },
        idField: { type: "string", description: "Optionaler Feldname für die ID" },
      },
      required: ["archive", "id"],
    },
    execute: async (toolCallId: string, args?: { archive?: string; id?: string; idField?: string }) => {
      return safeExecuteClient(["archive", "id"], args, async (client, safeArgs) => {
        // Dokumenten-Blob vom Client abrufen
        const responseData = await client.getDocument(safeArgs.archive, safeArgs.id, safeArgs.idField);

        // Konvertierung in Node.js Buffer und Ermittlung des MIME-Typs
        let buffer: Buffer;
        let mimeType = "application/octet-stream";

        if (typeof Blob !== "undefined" && responseData instanceof Blob) {
          mimeType = responseData.type || mimeType;
          const arrayBuffer = await responseData.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
        } else if (Buffer.isBuffer(responseData)) {
          buffer = responseData;
        } else {
          buffer = Buffer.from(responseData as any);
        }

        // Download-Ordner im Arbeitsverzeichnis sicherstellen
        //const downloadsDir = path.join(process.cwd());

        // const downloadsDir = path.join(process.cwd(), "downloads");

        // Bestimmung des Zielverzeichnisses über das Home-Verzeichnis
        const downloadsDir = process.env.DRDOC_DOWNLOAD_DIR || path.join(os.homedir(), "downloads", "drdoc"); //, "downloads");

        // 1. Umgebungsvariable, 2. Client-Config, 3. Home-Verzeichnis
        //const downloadsDir = process.env.DRDOC_DOWNLOAD_DIR
        //  || client.getConfig?.()?.downloadDir
        //  || path.join(os.homedir(), "Downloads");

        // Alternativ im temporären Verzeichnis des Betriebssystems:
        //const downloadsDir = process.env.DRDOC_DOWNLOAD_DIR || path.join(os.tmpdir(), "drdoc-downloads");

        if (!fs.existsSync(downloadsDir)) {
          fs.mkdirSync(downloadsDir, { recursive: true });
        }

        // Dateiendung bestimmen und Dateinamen generieren
        const extension = mimeType.includes("/") ? mimeType.split("/")[1] : "bin";
        const safeId = safeArgs.id.replace(/[^a-zA-Z0-9_-]/g, "_");
        const fileName = `${safeArgs.archive}_${safeId}.${extension}`;
        const filePath = path.join(downloadsDir, fileName);

        // Datei im Dateisystem ablegen
        fs.writeFileSync(filePath, buffer);

        // Web-URL für den direkten Aufruf im Browser erzeugen
        const baseUrl = client.getConfig?.()?.baseUrl || "https://drdoc.com";
        const webUrl = new URL("/model/document", baseUrl);
        webUrl.searchParams.set("action", "get");
        webUrl.searchParams.set("archive", safeArgs.archive);
        webUrl.searchParams.set("id", safeArgs.id);
        if (safeArgs.idField) {
          webUrl.searchParams.set("id_field", safeArgs.idField);
        }
        webUrl.searchParams.set("download", "false");

        // Rückgabe-Objekt für die Darstellung im Pi Agent
        const result: Record<string, any> = {
          message: `Dokument wurde erfolgreich heruntergeladen und lokal gespeichert nach "${filePath}".`,
          filePath: filePath,
          fileName: fileName,
          webUrl: webUrl.toString(),
          mimeType: mimeType,
          sizeBytes: buffer.length,
        };

        // Bei Bildern wird eine Base64-Data-URL zur direkten Inline-Anzeige hinzugefügt
        if (mimeType.startsWith("image/")) {
          result.imageBase64 = `data:${mimeType};base64,${buffer.toString("base64")}`;
        }

        return result;
      });
    },
  },
];