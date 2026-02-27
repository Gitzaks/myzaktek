"use client";
import { useState } from "react";

// ── Reapplication message data ─────────────────────────────────────────────

const REAPP_CATEGORIES = [
  {
    key: "exteriorCleaning",
    label: "Exterior Cleaning",
    items: [
      { key: "wheels", label: "Wheels/tires/wheel wells cleaned" },
      { key: "bugTar", label: "Bug & tar spots removed" },
      { key: "undercarriage", label: "Undercarriage cleaned" },
      { key: "frontGrill", label: "Front grill/bumpers cleaned" },
      { key: "doorTrunkEngine", label: "Door, trunk, and engine jambs cleaned" },
      { key: "carWash", label: "Car Wash" },
    ],
  },
  {
    key: "interiorCleaning",
    label: "Interior Cleaning",
    items: [
      { key: "carpetVacuum", label: "Carpet & upholstery vacuumed" },
      { key: "trunkVacuum", label: "Trunk vacuumed" },
      { key: "interiorCleaned", label: "Vehicle interior cleaned" },
      { key: "headliner", label: "Headliner cleaned" },
      { key: "dashConsole", label: "Dash & console cleaned" },
      { key: "doorPanels", label: "Door panels cleaned" },
      { key: "carpetShampoo", label: "Carpet & upholstery shampooed" },
      { key: "trunkShampoo", label: "Trunk shampooed" },
    ],
  },
  {
    key: "exteriorDetailing",
    label: "Exterior Detailing",
    items: [
      { key: "clayBar", label: "Clay Bar/Buff or Oxidation Removal" },
      { key: "wax", label: "Wax (ZAKTEK RE-APPLICATION)" },
      { key: "trimMolding", label: "Trim/Molding are cleaned and dressed" },
      { key: "headlights", label: "Headlights restored and polished" },
      { key: "taillights", label: "Taillights polished" },
      { key: "tiresWheels", label: "Tires and wheel dressed" },
      { key: "windows", label: "Windows cleaned" },
    ],
  },
  {
    key: "interiorDetailing",
    label: "Interior Detailing",
    items: [
      { key: "dashConsoleDressed", label: "Dash & Console Dressed" },
      { key: "visorMirrors", label: "Visor mirrors, rear view mirrors cleaned" },
      { key: "windshield", label: "Windshield & windows cleaned" },
      { key: "gloveCompartment", label: "Glove compartment cleaned and dressed" },
      { key: "ventsQtip", label: "Vents Q-tipped w/ dressing or Blown Out" },
      { key: "doorTrimVinyl", label: "Door trim/plastics/vinyl dressed" },
      { key: "allCompartments", label: "All compartments cleaned and dressed" },
      { key: "leather", label: "Leather conditioned" },
      { key: "floorMats", label: "Floor Mats vacuumed/shampooed" },
    ],
  },
] as const;

type CategoryKey = (typeof REAPP_CATEGORIES)[number]["key"];

interface AppointmentInfo {
  showDuration: boolean;
  duration: string;
  showAppointmentRequired: boolean;
}

interface ReappState {
  selected: Record<string, boolean>;
  appointmentInfo: AppointmentInfo;
}

function parseWhatToExpect(raw: string | undefined): ReappState {
  try {
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        selected: parsed.selected ?? {},
        appointmentInfo: parsed.appointmentInfo ?? {
          showDuration: false, duration: "", showAppointmentRequired: false,
        },
      };
    }
  } catch { /* fall through */ }
  return {
    selected: {},
    appointmentInfo: { showDuration: false, duration: "", showAppointmentRequired: false },
  };
}

// ── Types ──────────────────────────────────────────────────────────────────

interface DealerUser {
  _id: string;
  name: string;
  email: string;
  role: string;
}

interface DealerData {
  _id: string;
  name: string;
  dealerCode: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email?: string;
  serviceUrl?: string;
  unitsDealer?: string;
  dmeDealer?: string;
  billingDealer?: string;
  zieDealer?: string;
  zakCntrtsDealer?: string;
  whatToExpect?: string;
  logoUrl?: string;
  serviceReminderPdfUrl?: string;
  active: boolean;
}

// ── Reapplication Message Editor ────────────────────────────────────────────

function ReappEditor({
  value,
  onChange,
}: {
  value: ReappState;
  onChange: (v: ReappState) => void;
}) {
  function toggle(itemKey: string) {
    onChange({
      ...value,
      selected: { ...value.selected, [itemKey]: !value.selected[itemKey] },
    });
  }

  function selectAll(cat: (typeof REAPP_CATEGORIES)[number]) {
    const next = { ...value.selected };
    cat.items.forEach((item) => { next[item.key] = true; });
    onChange({ ...value, selected: next });
  }

  function selectNone(cat: (typeof REAPP_CATEGORIES)[number]) {
    const next = { ...value.selected };
    cat.items.forEach((item) => { next[item.key] = false; });
    onChange({ ...value, selected: next });
  }

  function setAppt(patch: Partial<AppointmentInfo>) {
    onChange({ ...value, appointmentInfo: { ...value.appointmentInfo, ...patch } });
  }

  return (
    <div>
      {REAPP_CATEGORIES.map((cat) => (
        <div key={cat.key} className="mb-6">
          <h3 className="text-lg font-bold italic text-gray-600 mb-1">{cat.label}</h3>
          <p className="text-xs font-semibold text-gray-600 mb-2">
            Select:{" "}
            <button onClick={() => selectAll(cat)} className="text-[#1565a8] hover:underline">All</button>
            {" | "}
            <button onClick={() => selectNone(cat)} className="text-[#1565a8] hover:underline">None</button>
          </p>
          <div className="space-y-1">
            {cat.items.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!value.selected[item.key]}
                  onChange={() => toggle(item.key)}
                  className="w-4 h-4 accent-[#1565a8]"
                />
                <span className="font-semibold text-gray-700">{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {/* Appointment Information */}
      <div className="mb-6">
        <h3 className="text-lg font-bold italic text-gray-600 mb-2">Appointment Information</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={value.appointmentInfo.showDuration}
              onChange={(e) => setAppt({ showDuration: e.target.checked })}
              className="w-4 h-4 accent-[#1565a8]"
            />
            <span className="font-semibold text-gray-700">Display how long the visit will take</span>
          </label>
          {value.appointmentInfo.showDuration && (
            <div className="flex items-center gap-3 ml-6 text-sm">
              <span className="font-semibold text-gray-700">Enter the length of the visit</span>
              <input
                type="text"
                value={value.appointmentInfo.duration}
                onChange={(e) => setAppt({ duration: e.target.value })}
                placeholder="1.5 hours"
                className="border-b border-gray-400 px-1 py-0.5 text-sm focus:outline-none focus:border-[#1565a8] w-32"
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={value.appointmentInfo.showAppointmentRequired}
              onChange={(e) => setAppt({ showAppointmentRequired: e.target.checked })}
              className="w-4 h-4 accent-[#1565a8]"
            />
            <span className="font-semibold text-gray-700">Show that they need an appointment</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function DealerEditClient({
  dealer: initialDealer,
  users: initialUsers,
}: {
  dealer: DealerData;
  users: DealerUser[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState(initialDealer.name);
  const [serviceUrl, setServiceUrl] = useState(initialDealer.serviceUrl ?? "");
  const [address, setAddress] = useState(initialDealer.address);
  const [city, setCity] = useState(initialDealer.city);
  const [stateFld, setStateFld] = useState(initialDealer.state);
  const [zip, setZip] = useState(initialDealer.zip);
  const [phone, setPhone] = useState(initialDealer.phone);
  const [unitsDealer, setUnitsDealer] = useState(initialDealer.unitsDealer ?? "");
  const [dmeDealer, setDmeDealer] = useState(initialDealer.dmeDealer ?? "");
  const [billingDealer, setBillingDealer] = useState(initialDealer.billingDealer ?? "");

  // Reapplication message
  const [reapp, setReapp] = useState<ReappState>(() =>
    parseWhatToExpect(initialDealer.whatToExpect)
  );
  const [showReapp, setShowReapp] = useState(false);
  const [savingReapp, setSavingReapp] = useState(false);
  const [reappMsg, setReappMsg] = useState("");

  // Logo
  const [logoUrl, setLogoUrl] = useState(initialDealer.logoUrl ?? "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");

  // PDF
  const [pdfUrl, setPdfUrl] = useState(initialDealer.serviceReminderPdfUrl ?? "");
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfError, setPdfError] = useState("");

  // Save dealer info
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveError, setSaveError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg("");
    setSaveError("");
    try {
      const res = await fetch(`/api/dealers/${initialDealer._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, serviceUrl, address, city, state: stateFld, zip, phone,
          unitsDealer, dmeDealer, billingDealer,
        }),
      });
      if (res.ok) {
        setSaveMsg("Saved successfully.");
      } else {
        const d = await res.json();
        setSaveError(d.error ?? "Save failed.");
      }
    } catch {
      setSaveError("Network error.");
    }
    setSaving(false);
  }

  async function handleSaveReapp() {
    setSavingReapp(true);
    setReappMsg("");
    try {
      const res = await fetch(`/api/dealers/${initialDealer._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatToExpect: JSON.stringify(reapp) }),
      });
      setReappMsg(res.ok ? "Saved." : "Failed to save.");
    } catch {
      setReappMsg("Network error.");
    }
    setSavingReapp(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setLogoError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/dealers/${initialDealer._id}/logo`, { method: "POST", body: form });
      if (res.ok) {
        const data = await res.json();
        setLogoUrl(data.logoUrl);
      } else {
        const d = await res.json();
        setLogoError(d.error ?? "Upload failed.");
      }
    } catch {
      setLogoError("Network error.");
    }
    setLogoUploading(false);
    e.target.value = "";
  }

  async function handleLogoRemove() {
    if (!confirm("Remove the dealership logo?")) return;
    await fetch(`/api/dealers/${initialDealer._id}/logo`, { method: "DELETE" });
    setLogoUrl("");
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfUploading(true);
    setPdfError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/dealers/${initialDealer._id}/pdf`, { method: "POST", body: form });
      if (res.ok) {
        const data = await res.json();
        setPdfUrl(data.serviceReminderPdfUrl);
      } else {
        const d = await res.json();
        setPdfError(d.error ?? "Upload failed.");
      }
    } catch {
      setPdfError("Network error.");
    }
    setPdfUploading(false);
    e.target.value = "";
  }

  async function handlePdfRemove() {
    if (!confirm("Remove the service reminder PDF?")) return;
    await fetch(`/api/dealers/${initialDealer._id}/pdf`, { method: "DELETE" });
    setPdfUrl("");
  }

  async function handleRemoveUser(userId: string) {
    if (!confirm("Remove this user from the dealership?")) return;
    setRemovingUserId(userId);
    await fetch(`/api/dealers/${initialDealer._id}/users/${userId}`, { method: "DELETE" });
    setUsers((prev) => prev.filter((u) => u._id !== userId));
    setRemovingUserId(null);
  }

  const fields: { label: string; value: string; setter: (v: string) => void }[] = [
    { label: "Name", value: name, setter: setName },
    { label: "Dealer Website", value: serviceUrl, setter: setServiceUrl },
    { label: "Address", value: address, setter: setAddress },
    { label: "City", value: city, setter: setCity },
    { label: "State", value: stateFld, setter: setStateFld },
    { label: "Zip Code", value: zip, setter: setZip },
    { label: "Phone", value: phone, setter: setPhone },
  ];

  const crossRefFields: { label: string; value: string; setter: (v: string) => void; hint: string }[] = [
    { label: "Units Sold Name", value: unitsDealer, setter: setUnitsDealer, hint: "Used for Units" },
    { label: "Autopoint Name", value: dmeDealer, setter: setDmeDealer, hint: "Used for Autopoint" },
    { label: "ZAKTEK Billing Name", value: billingDealer, setter: setBillingDealer, hint: "Used for Billing" },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Page header — matches reference design: icon + title on left, dealer logo on right */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-4xl leading-none">📋</span>
          <h1 className="text-2xl font-bold italic text-gray-700">Dealership Information</h1>
        </div>
        {logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logoUrl} alt={name} className="max-h-20 max-w-48 object-contain" />
        )}
      </div>

      {/* ── Manage Users ── */}
      <section className="mb-8">
        <h2 className="text-lg font-bold italic text-gray-600 mb-3">
          Manage Users in {name.toUpperCase()}
        </h2>
        <div className="overflow-x-auto rounded border border-gray-200 mb-3">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-[#1565a8] text-white">
                {["First Name", "Last Name", "Email", "Action"].map((h) => (
                  <th key={h} className="px-4 py-2 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">
                    No users assigned to this dealership.
                  </td>
                </tr>
              ) : (
                users.map((u, i) => {
                  const parts = u.name.trim().split(/\s+/);
                  const firstName = parts[0] ?? "";
                  const lastName = parts.slice(1).join(" ");
                  return (
                    <tr key={u._id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-2 text-gray-700">{firstName}</td>
                      <td className="px-4 py-2 text-gray-700">{lastName}</td>
                      <td className="px-4 py-2 text-gray-600">{u.email}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleRemoveUser(u._id)}
                          disabled={removingUserId === u._id}
                          className="text-[#1565a8] hover:underline text-sm disabled:opacity-50"
                        >
                          {removingUserId === u._id ? "Removing…" : "Remove"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <a
          href={`/admin/users/new?dealerId=${initialDealer._id}`}
          className="inline-block bg-[#1565a8] text-white px-4 py-2 rounded text-sm hover:bg-[#0f4f8a]"
        >
          Add User
        </a>
      </section>

      {/* ── Update Reapplication Message ── */}
      <section className="mb-8">
        <h2 className="text-lg font-bold italic text-gray-600 mb-1">Update Reapplication Message</h2>
        <p className="text-sm text-gray-600 mb-3">
          Select the messages that display when a customer views the &apos;what to expect on your visit&apos; page{" "}
          <button
            onClick={() => setShowReapp((v) => !v)}
            className="text-[#1565a8] hover:underline font-medium"
          >
            {showReapp ? "hide" : "here"}
          </button>
        </p>
        {showReapp && (
          <div className="border border-gray-200 rounded p-4 bg-white">
            <ReappEditor value={reapp} onChange={setReapp} />
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={handleSaveReapp}
                disabled={savingReapp}
                className="bg-[#1565a8] text-white px-5 py-2 rounded text-sm hover:bg-[#0f4f8a] disabled:opacity-50"
              >
                {savingReapp ? "Saving…" : "Save"}
              </button>
              {reappMsg && <span className="text-sm text-gray-600">{reappMsg}</span>}
            </div>
          </div>
        )}
      </section>

      {/* ── Upload Service Reminder ── */}
      <section className="mb-8">
        <h2 className="text-lg font-bold italic text-gray-600 mb-2">Upload Service Reminder</h2>
        <div className="flex items-center gap-3 text-sm text-gray-600 mb-2">
          <span>You must select a single file with a *.pdf extension</span>
          <label className="cursor-pointer border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 text-gray-700">
            {pdfUploading ? "Uploading…" : "Select File"}
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handlePdfUpload}
              disabled={pdfUploading}
            />
          </label>
        </div>
        {pdfError && <p className="text-red-600 text-sm mb-2">{pdfError}</p>}
        {pdfUrl && (
          <div className="space-y-1 text-sm">
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-[#1565a8] hover:underline block">
              Click to see Service Reminder
            </a>
            <div className="flex items-center gap-2 text-gray-600">
              <span>Click to remove Service Reminder</span>
              <button
                onClick={handlePdfRemove}
                className="border border-gray-300 rounded px-3 py-1 text-sm hover:bg-gray-50"
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Upload Dealership Logo ── */}
      <section className="mb-8">
        <h2 className="text-lg font-bold italic text-gray-600 mb-2">Upload Dealership Logo</h2>
        <div className="flex items-center gap-3 text-sm text-gray-600 mb-2">
          <span>You must select a single file with a *.png extension</span>
          <label className="cursor-pointer border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 text-gray-700">
            {logoUploading ? "Uploading…" : "Select Picture"}
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.gif,.webp"
              className="hidden"
              onChange={handleLogoUpload}
              disabled={logoUploading}
            />
          </label>
        </div>
        {logoError && <p className="text-red-600 text-sm mb-2">{logoError}</p>}
        {logoUrl && (
          <div className="flex items-center gap-4 mt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Dealer logo" className="max-h-20 max-w-48 object-contain border border-gray-200 rounded p-1" />
            <button onClick={handleLogoRemove} className="text-red-500 hover:underline text-sm">Remove</button>
          </div>
        )}
      </section>

      {/* ── Dealer Info Form ── */}
      <form onSubmit={handleSave} className="space-y-4">
        {/* Read-only dealer code */}
        <div className="flex items-start gap-4">
          <label className="w-52 text-right text-sm font-semibold text-gray-700 pt-2 flex-shrink-0">
            ZAK Account Code
          </label>
          <div className="flex-1">
            <input
              type="text"
              value={initialDealer.dealerCode}
              readOnly
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">Used for MPP, ZIE</p>
          </div>
        </div>

        {fields.map(({ label, value, setter }) => (
          <div key={label} className="flex items-start gap-4">
            <label className="w-52 text-right text-sm font-semibold text-gray-700 pt-2 flex-shrink-0">
              {label}
            </label>
            <div className="flex-1">
              <input
                type="text"
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
              />
            </div>
          </div>
        ))}

        {crossRefFields.map(({ label, value, setter, hint }) => (
          <div key={label} className="flex items-start gap-4">
            <label className="w-52 text-right text-sm font-semibold text-gray-700 pt-2 flex-shrink-0">
              {label}
            </label>
            <div className="flex-1">
              <input
                type="text"
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
              />
              <p className="text-xs text-gray-500 mt-1">{hint}</p>
            </div>
          </div>
        ))}

        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#1565a8] text-white px-6 py-2 rounded text-sm hover:bg-[#0f4f8a] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {saveMsg && <span className="text-green-700 text-sm">{saveMsg}</span>}
          {saveError && <span className="text-red-600 text-sm">{saveError}</span>}
        </div>
      </form>
    </div>
  );
}
