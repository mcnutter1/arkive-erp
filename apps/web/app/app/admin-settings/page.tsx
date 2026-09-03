"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Setting = {
  id: string;
  section: string;
  key: string;
  value: Record<string, unknown>;
  updatedAt: string;
};

type Person = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
};

type PeopleResponse = {
  data: Person[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

type M365Config = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  defaultDomain: string;
  webhookSecret: string;
};

type AwsSesConfig = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
  replyToEmail: string;
};

type ESignConfig = {
  enabled: boolean;
  provider: string;
  apiKey: string;
  accountId: string;
  webhookSecret: string;
};

type GrantLettersConfig = {
  companyName: string;
  legalEntityName: string;
  signatoryPersonId: string;
  signatoryName: string;
  signatoryTitle: string;
  autoCreateSignatureRequest: boolean;
};

function defaultM365(): M365Config {
  return {
    tenantId: '',
    clientId: '',
    clientSecret: '',
    defaultDomain: '',
    webhookSecret: '',
  };
}

function defaultSes(): AwsSesConfig {
  return {
    region: '',
    accessKeyId: '',
    secretAccessKey: '',
    fromEmail: '',
    replyToEmail: '',
  };
}

function defaultEsign(): ESignConfig {
  return {
    enabled: false,
    provider: 'native',
    apiKey: '',
    accountId: '',
    webhookSecret: '',
  };
}

function defaultGrantLetters(): GrantLettersConfig {
  return {
    companyName: 'Arkive Company',
    legalEntityName: 'Arkive Company, Inc.',
    signatoryPersonId: '',
    signatoryName: 'Authorized Signatory',
    signatoryTitle: 'Company Officer',
    autoCreateSignatureRequest: true,
  };
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [m365, setM365] = useState<M365Config>(defaultM365());
  const [awsSes, setAwsSes] = useState<AwsSesConfig>(defaultSes());
  const [esign, setEsign] = useState<ESignConfig>(defaultEsign());
  const [grantLetters, setGrantLetters] = useState<GrantLettersConfig>(defaultGrantLetters());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const peopleOptions = useMemo(
    () => people.map((p) => ({ id: p.id, label: `${p.legalFirstName} ${p.legalLastName}` })),
    [people],
  );

  function readSettingValue(section: string, key: string): Record<string, unknown> | null {
    const setting = settings.find((s) => s.section === section && s.key === key);
    return setting?.value ?? null;
  }

  function hydrateFormsFromSettings(allSettings: Setting[]) {
    const integrationsM365 = allSettings.find((s) => s.section === 'integrations' && s.key === 'm365')?.value;
    const integrationsSes = allSettings.find((s) => s.section === 'integrations' && s.key === 'awsSes')?.value;
    const integrationsEsign = allSettings.find((s) => s.section === 'integrations' && s.key === 'esign')?.value;
    const letters = allSettings.find((s) => s.section === 'equity' && s.key === 'grantLetters')?.value;
    const company = allSettings.find((s) => s.section === 'company' && s.key === 'profile')?.value;

    setM365({
      ...defaultM365(),
      ...(integrationsM365 ?? {}),
    } as M365Config);

    setAwsSes({
      ...defaultSes(),
      ...(integrationsSes ?? {}),
    } as AwsSesConfig);

    setEsign({
      ...defaultEsign(),
      ...(integrationsEsign ?? {}),
    } as ESignConfig);

    const companyObj = (company ?? {}) as Record<string, unknown>;
    setGrantLetters({
      ...defaultGrantLetters(),
      ...(letters ?? {}),
      companyName:
        typeof companyObj.companyName === 'string'
          ? companyObj.companyName
          : defaultGrantLetters().companyName,
      legalEntityName:
        typeof companyObj.legalEntityName === 'string'
          ? companyObj.legalEntityName
          : defaultGrantLetters().legalEntityName,
    } as GrantLettersConfig);
  }

  async function listSection(section: string): Promise<Setting[]> {
    const response = await fetch(`${apiBaseUrl}/admin/settings/${section}`, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Unable to load ${section} settings.`);
    }
    return (await response.json()) as Setting[];
  }

  async function loadSettings() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const [integrations, equity, company, peopleResp] = await Promise.all([
        listSection('integrations'),
        listSection('equity'),
        listSection('company'),
        fetch(`${apiBaseUrl}/people?page=1&pageSize=100`, { credentials: 'include' }),
      ]);

      if (!peopleResp.ok) {
        setError('Unable to load people for signatory selection.');
        return;
      }

      const peoplePayload = (await peopleResp.json()) as PeopleResponse;
      setPeople(peoplePayload.data);

      const allSettings = [...integrations, ...equity, ...company];
      setSettings(allSettings);
      hydrateFormsFromSettings(allSettings);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load settings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function upsertSetting(section: string, key: string, value: Record<string, unknown>) {
    const response = await fetch(`${apiBaseUrl}/admin/settings`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, key, value }),
    });

    if (!response.ok) {
      throw new Error('Unable to save setting.');
    }
  }

  async function saveM365(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    try {
      await upsertSetting('integrations', 'm365', m365 as unknown as Record<string, unknown>);
      setNotice('M365 settings saved.');
      await loadSettings();
    } catch {
      setError('Unable to save M365 settings.');
    }
  }

  async function saveAwsSes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    try {
      await upsertSetting('integrations', 'awsSes', awsSes as unknown as Record<string, unknown>);
      setNotice('AWS SES settings saved.');
      await loadSettings();
    } catch {
      setError('Unable to save AWS SES settings.');
    }
  }

  async function saveEsign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    try {
      await upsertSetting('integrations', 'esign', esign as unknown as Record<string, unknown>);
      setNotice('E-sign settings saved.');
      await loadSettings();
    } catch {
      setError('Unable to save e-sign settings.');
    }
  }

  async function saveGrantLetters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    try {
      await upsertSetting('company', 'profile', {
        companyName: grantLetters.companyName,
        legalEntityName: grantLetters.legalEntityName,
      });

      await upsertSetting('equity', 'grantLetters', {
        signatoryPersonId: grantLetters.signatoryPersonId,
        signatoryName: grantLetters.signatoryName,
        signatoryTitle: grantLetters.signatoryTitle,
        autoCreateSignatureRequest: grantLetters.autoCreateSignatureRequest,
      });

      setNotice('Grant letter settings saved.');
      await loadSettings();
    } catch {
      setError('Unable to save grant letter settings.');
    }
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Admin Integrations and E-Sign</h1>
        <p className="mt-2 text-sm text-slate-600">
          Configure M365, email delivery, e-sign providers, and grant letter defaults.
        </p>
        <button
          type="button"
          onClick={() => void loadSettings()}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          {loading ? 'Refreshing...' : 'Refresh Settings'}
        </button>
      </header>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Microsoft 365</h2>
          <form className="mt-4 grid gap-3" onSubmit={saveM365}>
            <input value={m365.tenantId} onChange={(e) => setM365((prev) => ({ ...prev, tenantId: e.target.value }))} placeholder="Tenant ID" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input value={m365.clientId} onChange={(e) => setM365((prev) => ({ ...prev, clientId: e.target.value }))} placeholder="Client ID" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input type="password" value={m365.clientSecret} onChange={(e) => setM365((prev) => ({ ...prev, clientSecret: e.target.value }))} placeholder="Client Secret" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input value={m365.defaultDomain} onChange={(e) => setM365((prev) => ({ ...prev, defaultDomain: e.target.value }))} placeholder="Default Domain" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input type="password" value={m365.webhookSecret} onChange={(e) => setM365((prev) => ({ ...prev, webhookSecret: e.target.value }))} placeholder="Webhook Secret" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">Save M365 Settings</button>
          </form>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">AWS SES Email</h2>
          <form className="mt-4 grid gap-3" onSubmit={saveAwsSes}>
            <input value={awsSes.region} onChange={(e) => setAwsSes((prev) => ({ ...prev, region: e.target.value }))} placeholder="Region (e.g. us-east-1)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input value={awsSes.accessKeyId} onChange={(e) => setAwsSes((prev) => ({ ...prev, accessKeyId: e.target.value }))} placeholder="Access Key ID" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input type="password" value={awsSes.secretAccessKey} onChange={(e) => setAwsSes((prev) => ({ ...prev, secretAccessKey: e.target.value }))} placeholder="Secret Access Key" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input type="email" value={awsSes.fromEmail} onChange={(e) => setAwsSes((prev) => ({ ...prev, fromEmail: e.target.value }))} placeholder="From Email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input type="email" value={awsSes.replyToEmail} onChange={(e) => setAwsSes((prev) => ({ ...prev, replyToEmail: e.target.value }))} placeholder="Reply-To Email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">Save SES Settings</button>
          </form>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">E-Sign Provider</h2>
          <form className="mt-4 grid gap-3" onSubmit={saveEsign}>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={esign.enabled} onChange={(e) => setEsign((prev) => ({ ...prev, enabled: e.target.checked }))} />
              Enabled
            </label>
            <select value={esign.provider} onChange={(e) => setEsign((prev) => ({ ...prev, provider: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="native">Native</option>
              <option value="docusign">DocuSign</option>
              <option value="adobe-sign">Adobe Sign</option>
            </select>
            <input type="password" value={esign.apiKey} onChange={(e) => setEsign((prev) => ({ ...prev, apiKey: e.target.value }))} placeholder="API Key / Token" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input value={esign.accountId} onChange={(e) => setEsign((prev) => ({ ...prev, accountId: e.target.value }))} placeholder="Account ID" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input type="password" value={esign.webhookSecret} onChange={(e) => setEsign((prev) => ({ ...prev, webhookSecret: e.target.value }))} placeholder="Webhook Secret" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">Save E-Sign Settings</button>
          </form>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Grant Letter Defaults</h2>
          <form className="mt-4 grid gap-3" onSubmit={saveGrantLetters}>
            <input value={grantLetters.companyName} onChange={(e) => setGrantLetters((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="Company Name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input value={grantLetters.legalEntityName} onChange={(e) => setGrantLetters((prev) => ({ ...prev, legalEntityName: e.target.value }))} placeholder="Legal Entity Name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select value={grantLetters.signatoryPersonId} onChange={(e) => setGrantLetters((prev) => ({ ...prev, signatoryPersonId: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select signatory person</option>
              {peopleOptions.map((person) => (
                <option key={person.id} value={person.id}>{person.label}</option>
              ))}
            </select>
            <input value={grantLetters.signatoryName} onChange={(e) => setGrantLetters((prev) => ({ ...prev, signatoryName: e.target.value }))} placeholder="Signatory Name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input value={grantLetters.signatoryTitle} onChange={(e) => setGrantLetters((prev) => ({ ...prev, signatoryTitle: e.target.value }))} placeholder="Signatory Title" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={grantLetters.autoCreateSignatureRequest} onChange={(e) => setGrantLetters((prev) => ({ ...prev, autoCreateSignatureRequest: e.target.checked }))} />
              Auto-create e-sign request in grant workflow
            </label>
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">Save Grant Letter Settings</button>
          </form>
        </article>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Raw Settings Snapshot</h2>
        <p className="mt-1 text-sm text-slate-600">Current stored values for integrations, company profile, and equity grant letters.</p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify({
          integrations: {
            m365: readSettingValue('integrations', 'm365'),
            awsSes: readSettingValue('integrations', 'awsSes'),
            esign: readSettingValue('integrations', 'esign'),
          },
          company: {
            profile: readSettingValue('company', 'profile'),
          },
          equity: {
            grantLetters: readSettingValue('equity', 'grantLetters'),
          },
        }, null, 2)}</pre>
      </article>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
    </section>
  );
}
