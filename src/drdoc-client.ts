import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { URLSearchParams } from "url";

/**
 * Interface für Standard-Antworten der Dr.DOC REST API
 */
export interface DrDocResponse<T = any> {
  HasError: boolean;
  Error?: {
    Message: string;
    InternalMessage?: string;
  };
  Count?: number;
  CountTotal?: number;
  Result?: T;
  $ModelType?: string;
}

/**
 * Konfiguration für den DrDOC Client
 */
export interface DrDocConfig {
  baseUrl: string;
  username?: string;
  password?: string;
  totp?: string;
  /**
   * Deaktiviert die Zertifikatsprüfung für selbstsignierte HTTPS-Zertifikate.
   */
  ignoreSSL?: boolean;
  sessionCookie?: string;
  authHeader?: string;
}

/**
 * Hilfsmethode zum sicheren Abrufen des UI-Objekts aus dem globalen Kontext (globalThis).
 * Verhindert ReferenceError-Ausnahmen bei nicht deklarierten Variablen.
 */
function getGlobalUI(): any {
  const g = globalThis as any;
  return g.ctx?.ui || g.pi?.ui;
}

export function msgLog(...args: any[]) {
  console.log(...args);
  const ui = getGlobalUI();
  if (typeof ui?.notify === "function") {
    ui.notify(...args);
  }
}

export function msgInfo(message: string) {
  const ui = getGlobalUI();
  if (typeof ui?.notify === "function") {
    ui.notify(message, "info");
  } else {
    console.log(message);
  }
}

export function msgError(message: string) {
  const ui = getGlobalUI();
  if (typeof ui?.notify === "function") {
    ui.notify(message, "error");
  } else {
    console.error(message);
  }
}

/**
 * Liefert den absoluten Pfad zum globalen Einstellungs-Verzeichnis (~/.pi/agent/).
 */
export function getGlobalSettingsDir(): string {
  // Berücksichtigung von benutzerdefinierten Pfaden über Umgebungsvariablen
  if (process.env.DRDOC_CONFIG_DIR) {
    return process.env.DRDOC_CONFIG_DIR;
  }
  if (process.env.PI_CONFIG_DIR) {
    return process.env.PI_CONFIG_DIR;
  }
  return path.join(os.homedir(), ".pi", "agent");
  // path.resolve(process.cwd()
}

/**
 * Client-Klasse für die Interaktion mit der Dr.DOC REST API.
 * Verwaltet Sitzungscookies und führt HTTP-Requests aus.
 */
export class DrDocClient {
  private config: DrDocConfig;
  private storageFilePath: string;
  //private sessionCookie: string | null = null;
  //private authHeader: string | null = null;

  constructor(config: DrDocConfig) {
    this.config = config; //{ ...config };
    this.storageFilePath = path.join(getGlobalSettingsDir(), ".drdoc-session.json");

    // Vorhandene Anmeldedaten beim Instanziieren aus der JSON-Datei laden
    this.loadCredentials();

    // Basis-Konfiguration und HTTP-Einstellungen anwenden
    this.applyConfig();

    if (process.env.DRDOC_DEBUG)
      msgLog('Ctor', this.config);
  }

  public getConfig(): any {
    return this.config;
  }

  /**
   * Wendet die Eigenschaften aus 'config' auf die Instanzvariablen an.
   */
  private applyConfig(): void {
    if (!this.config.baseUrl) {
      this.config.baseUrl = process.env.DRDOC_BASE_URL;
    }
    if (!this.config.baseUrl) {
      throw new Error("DrDocClient erfordert eine gültige 'baseUrl' in der Konfiguration.");
    }

    if (this.config.ignoreSSL || process.env.DRDOC_IGNORE_SSL) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }

    this.config.baseUrl = this.config.baseUrl.replace(/\/$/, "");

    if (this.config.username && this.config.password) {
      const authStr = `${this.config.username}:${this.config.password}`;
      this.config.authHeader = `Basic ${Buffer.from(authStr).toString("base64")}`;
    }
  }

  /**
   * Liest gespeicherte Anmeldedaten als DrDocConfig aus der JSON-Datei aus, sofern vorhanden.
   */
  private loadCredentials(): void {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const fileContent = fs.readFileSync(this.storageFilePath, "utf-8");
        const savedConfig: DrDocConfig = JSON.parse(fileContent);

        // Gespeicherte Werte mit den übergebenen Konfigurationswerten zusammenführen
        this.config = {
          ...this.config,
          ...savedConfig,
        };
      }
    } catch (error) {
      console.warn("Gespeicherte Anmeldedaten konnten nicht geladen werden:", error);
    }
  }

  /**
   * Speichert das DrDocConfig-Objekt als JSON-Datei ab.
   */
  private saveCredentials(): void {
    try {
      const dataToSave = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(this.storageFilePath, dataToSave, "utf-8");
      if (process.env.DRDOC_DEBUG)
        msgLog('Dr.DOC Anmeldedaten wurden gespeichert unter: ', this.storageFilePath);
    } catch (error) {
      throw new Error(`Fehler beim Speichern der Anmeldedaten: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Erstellt Standard-Header inklusive Session-Cookie und Auth-Header
   */
  private getHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...additionalHeaders };

    if (this.config?.sessionCookie) {
      headers["Cookie"] = this.config.sessionCookie;
    } else if (this.config.authHeader) {
      //headers["Authorization"] = this.config.authHeader;
    }

    return headers;
  }

  /**
   * Speichert erhaltene Cookies (insbesondere 'uid' für User Sessions)
   */
  private processResponseCookies(response: Response): void {
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const match = setCookie.match(/uid=([^;]+)/);
      if (match) {
        const oldCookieValue = this.config.sessionCookie;
        this.config.sessionCookie = `uid=${match[1]}`;
        // bei Cookie Änderung, Cookie uid explizit abspeichern
        if (oldCookieValue != this.config.sessionCookie)
          this.saveCredentials();
      }
    }
  }

  /**
   * Hilfsmethode für GET-Anfragen
   */
  public async get<T = any>(endpoint: string, params: Record<string, any> = {}): Promise<DrDocResponse<T>> {
    // Verwendung des URL-Objekts zur sauberen Zusammenführung von baseUrl und endpoint
    const url = new URL(endpoint, this.config.baseUrl);

    if (process.env.DRDOC_DEBUG)
      msgLog("DD Get Head: ", endpoint, params, url);

    // Befüllung der SearchParams
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        if (Array.isArray(val)) {
          // Umgang mit Arrays: Parameter mehrfach anhängen
          val.forEach((item) => url.searchParams.append(key, String(item)));
        } else if (typeof val === "object") {
          url.searchParams.append(key, JSON.stringify(val));
        } else {
          url.searchParams.append(key, String(val));
        }
      }
    });

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    this.processResponseCookies(response);
    return (await response.json()) as DrDocResponse<T>;
  }

  /**
   * Hilfsmethode für GET-Anfragen
   */
  public async getBlob<T = any>(endpoint: string, params: Record<string, any> = {}): Promise<Blob> {
    // Verwendung des URL-Objekts zur sauberen Zusammenführung von baseUrl und endpoint
    const url = new URL(endpoint, this.config.baseUrl);

    if (process.env.DRDOC_DEBUG)
      msgLog("DD Get Blob Head: ", endpoint, params, url);

    // Befüllung der SearchParams
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        if (Array.isArray(val)) {
          // Umgang mit Arrays: Parameter mehrfach anhängen
          val.forEach((item) => url.searchParams.append(key, String(item)));
        } else if (typeof val === "object") {
          url.searchParams.append(key, JSON.stringify(val));
        } else {
          url.searchParams.append(key, String(val));
        }
      }
    });

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    this.processResponseCookies(response);

    return response.blob();
  }

  /**
   * Hilfsmethode für POST-Anfragen (Form URL-Encoded oder Multipart)
   */
  public async post<T = any>(endpoint: string, data: Record<string, any> = {}): Promise<DrDocResponse<T>> {
    // Verwendung des URL-Objekts zur sauberen Zusammenführung von baseUrl und endpoint
    const url = new URL(endpoint, this.config.baseUrl);

    if (process.env.DRDOC_DEBUG)
      msgLog("DD Post Head: ", endpoint, data, url);

    const body = new URLSearchParams();
    Object.entries(data).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        if (Array.isArray(val)) {
          // Umgang mit Arrays: Parameter mehrfach anhängen
          val.forEach((item) => body.append(key, String(item)));
        } else if (typeof val === "object") {
          body.append(key, JSON.stringify(val));
        } else {
          body.append(key, String(val));
        }
      }
    });

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders({
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      }),
      body: body.toString(),
    });

    this.processResponseCookies(response);
    return (await response.json()) as DrDocResponse<T>;
  }

  // --- Endpoint: Benutzerverwaltung ---

  public async signin(username?: string, password?: string, totp?: string): Promise<DrDocResponse> {
    const user = username || this.config.username;
    const pass = password || this.config.password;
    const totpCode = totp || this.config.totp;

    // Ausführung des API-Aufrufs zur Anmeldung
    const response = await this.post("/user", {
      action: "signin",
      username: user,
      password: pass,
      totp: totpCode,
    });

    // Überprüfung auf erfolgreiche Anmeldung
    if (response && !response.HasError) {
      this.config.username = user;
      this.config.password = pass;
      if (totpCode) {
        this.config.totp = totpCode;
      }

      // Aktualisierung der internen Variablen (Auth-Header etc.)
      this.applyConfig();

      // Dauerhaftes Speichern der gesamten DrDocConfig nach erfolgreichem Login
      this.saveCredentials();

      if (process.env.DRDOC_DEBUG)
        msgLog('DD: Sign in OK: ', JSON.stringify(this.config));
    }
    else {
      //if (process.env.DRDOC_DEBUG)
      if (process.env.DRDOC_DEBUG)
        msgLog('DD: Sign in ERROR: ' + JSON.stringify(this.config));
    }

    return response;
  }

  public async state(): Promise<DrDocResponse> {

    // Ausführung des API-Aufrufs zur Anmeldung
    const response = await this.post("/user", {
      action: "status",
    });

    // Überprüfung auf erfolgreiche Anmeldung
    if (response && !response.HasError) {
      if (process.env.DRDOC_DEBUG)
        msgLog('Dr.DOC: State OK:', this.config);
      return true;
    }
    else {
      msgError('Bitte erneut anmelden mit Slash Command `/drdoc_login`');
      if (process.env.DRDOC_DEBUG)
        msgLog('Dr.DOC: State ERROR: ' + JSON.stringify(this.config));
      return false;
    }
  }

  public async signout(): Promise<DrDocResponse> {
    return this.post("/user", { action: "signout" });
  }

  public async userStatus(): Promise<DrDocResponse> {
    return this.post("/user", { action: "status" });
  }

  // --- Endpoint: Metadaten CRUD ---

  public async getRecord(archive: string, id: string, idField?: string): Promise<DrDocResponse> {
    return this.post("/model/crud", {
      action: "get",
      archive,
      id,
      id_field: idField,
    });
  }

  public async createRecord(archive: string, value: Record<string, any>): Promise<DrDocResponse> {
    return this.get("/model/crud", {
      action: "create",
      archive,
      value,
    });
  }

  public async updateRecord(archive: string, value: Record<string, any>): Promise<DrDocResponse> {
    return this.post("/model/crud", {
      action: "set",
      archive,
      value,
    });
  }

  // VORSICHT!!
  public async removeRecord(archive: string, id: string): Promise<DrDocResponse> {
    return this.post("/model/crud", {
      action: "remove",
      archive,
      id,
    });
  }

  public async searchFields(
    archive: string,
    value: Record<string, any>,
    options: { selection?: string; count?: number; start?: number } = {}
  ): Promise<DrDocResponse> {
    return this.post("/model/crud", {
      action: "searchfields",
      archive,
      value,
      ...options,
    });
  }

  public async textRetrieval(
    archive: string,
    queryText: string,
    options: { selection?: string; count?: number; start?: number } = {}
  ): Promise<DrDocResponse> {
    return this.post("/model/crud", {
      action: "textretrieval",
      archive,
      value: queryText,
      ...options,
    });
  }

  // --- Endpoint: Document ---

  public async getDocument(archive: string, id: string, idField?: string): Blob {
    return this.getBlob("/model/document", {
      action: "get",
      archive,
      id,
      id_field: idField,
    });
  }

  // --- Endpoint: Fieldselections / Fieldproperties ---

  public async getFieldProperty(archive: string, type: string): Promise<DrDocResponse> {
    return this.get("/model/fieldselection", {
      action: "get-fieldproperty",
      archive,
      type,
    });
  }

  public async getFieldSelection(archive: string, type: string, name: string): Promise<DrDocResponse> {
    return this.get("/model/fieldselection", {
      action: "get-fieldselection",
      archive,
      type,
      name
    });
  }

  public async listFieldSelections(archive: string, type: string): Promise<DrDocResponse> {
    return this.get("/model/fieldselection", {
      action: "list-fieldselections",
      archive,
      type,
    });
  }
}
