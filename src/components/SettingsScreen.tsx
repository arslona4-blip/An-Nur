"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";
import { PRODUCT_NAME } from "@/lib/brand";

export function SettingsScreen() {
  const [form, setForm] = useState({
    store_name: "",
    store_phone: "",
    store_address: "",
    receipt_footer: "",
    opening_cash: "",
    allow_negative_stock: "0",
    expiry_alert_days: "7",
    telegram_bot_token: "",
    telegram_chat_id: "",
    telegram_alerts_enabled: "0",
    usd_enabled: "0",
    usd_rate: "12500",
    printer_width: "58",
    printer_ip: "",
    printer_port: "9100",
    scale_enabled: "1",
    fiscal_enabled: "0",
    store_tin: "",
    fiscal_merchant_name: "",
    sms_enabled: "0",
    sms_email: "",
    sms_password: "",
    sms_sender: "4546",
    offline_mode_enabled: "1",
    openai_api_key: "",
    telegram_bot_enabled: "0",
    telegram_webhook_secret: "",
    telegram_webhook_url: "",
    telegram_admin_ids: "",
    telegram_courier_ids: "",
    delivery_fee_default: "0",
  });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<{ settings: Record<string, string> }>("/api/settings").then((d) => {
      setForm({
        store_name: d.settings.store_name || "",
        store_phone: d.settings.store_phone || "",
        store_address: d.settings.store_address || "",
        receipt_footer: d.settings.receipt_footer || "",
        opening_cash: d.settings.opening_cash || "0",
        allow_negative_stock: d.settings.allow_negative_stock || "0",
        expiry_alert_days: d.settings.expiry_alert_days || "7",
        telegram_bot_token: d.settings.telegram_bot_token || "",
        telegram_chat_id: d.settings.telegram_chat_id || "",
        telegram_alerts_enabled: d.settings.telegram_alerts_enabled || "0",
        usd_enabled: d.settings.usd_enabled || "0",
        usd_rate: d.settings.usd_rate || "12500",
        printer_width: d.settings.printer_width || "58",
        printer_ip: d.settings.printer_ip || "",
        printer_port: d.settings.printer_port || "9100",
        scale_enabled: d.settings.scale_enabled || "1",
        fiscal_enabled: d.settings.fiscal_enabled || "0",
        store_tin: d.settings.store_tin || "",
        fiscal_merchant_name: d.settings.fiscal_merchant_name || "",
        sms_enabled: d.settings.sms_enabled || "0",
        sms_email: d.settings.sms_email || "",
        sms_password: d.settings.sms_password || "",
        sms_sender: d.settings.sms_sender || "4546",
        offline_mode_enabled: d.settings.offline_mode_enabled || "1",
        openai_api_key: d.settings.openai_api_key || "",
        telegram_bot_enabled: d.settings.telegram_bot_enabled || "0",
        telegram_webhook_secret: d.settings.telegram_webhook_secret || "",
        telegram_webhook_url: d.settings.telegram_webhook_url || "",
        telegram_admin_ids: d.settings.telegram_admin_ids || "",
        telegram_courier_ids: d.settings.telegram_courier_ids || "",
        delivery_fee_default: d.settings.delivery_fee_default || "0",
      });
    });
  }, []);

  async function save() {
    await api("/api/settings", { method: "PUT", body: JSON.stringify(form) });
    setMsg("Saqlandi");
  }

  async function backup() {
    const data = await api<Record<string, unknown>>("/api/settings", { method: "POST" });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hisob-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  async function resetData() {
    const typed = prompt(
      "Barcha mahsulot, savdo, smena, mijoz, ta'minotchi va qoldiqlar o'chiriladi.\nXodimlar, sozlamalar va toifalar qoladi.\nAvval zaxira nusxa yuklab olinadi.\n\nDavom etish uchun TOZALASH deb yozing:",
    );
    if (typed?.trim().toUpperCase() !== "TOZALASH") return;
    await backup();
    await api("/api/settings/reset", { method: "POST", body: JSON.stringify({ confirm: "TOZALASH" }) });
    setMsg("Ma'lumotlar tozalandi. Endi o'z mahsulotlaringizni qo'shing.");
    alert("✅ Tozalandi!\n\nMahsulotlar, savdolar va mijozlar o'chirildi.\nZaxira nusxa kompyuteringizga yuklab olindi.\n\nTekshirish: «Mahsulotlar» sahifasi bo'sh bo'lishi kerak.");
  }

  async function testTelegram() {
    await api("/api/telegram", { method: "POST", body: JSON.stringify({ action: "test" }) });
    setMsg("Telegram test xabari yuborildi");
  }

  async function sendAlerts() {
    await api("/api/telegram", { method: "POST", body: JSON.stringify({ action: "alerts" }) });
    setMsg("Ogohlantirish yuborildi");
  }

  async function setWebhook() {
    const url = form.telegram_webhook_url.trim() || prompt("Ommaviy HTTPS manzil (ngrok/cloudflare):");
    if (!url) return;
    await save();
    const r = await api<{ url: string }>("/api/telegram", {
      method: "POST",
      body: JSON.stringify({ action: "setWebhook", url }),
    });
    setForm((f) => ({ ...f, telegram_webhook_url: url.replace(/\/$/, "") }));
    setMsg(`Webhook ulandi: ${r.url}`);
  }

  async function deleteWebhook() {
    await api("/api/telegram", { method: "POST", body: JSON.stringify({ action: "deleteWebhook" }) });
    setMsg("Webhook o‘chirildi");
  }

  async function testSms() {
    const phone = prompt("Test telefon raqami (901234567):");
    if (!phone) return;
    await api("/api/sms", { method: "POST", body: JSON.stringify({ action: "test", phone }) });
    setMsg("SMS yuborildi");
  }

  async function restore(file: File) {
    if (!confirm("Joriy ma'lumotlar o'rniga zaxira tiklanadi. Davom etasizmi?")) return;
    const text = await file.text();
    const payload = JSON.parse(text);
    await api("/api/export", { method: "POST", body: JSON.stringify(payload) });
    setMsg("Zaxira tiklandi. Sahifani yangilang.");
    window.location.reload();
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-extrabold">Sozlamalar</h1>
      <LicenseCard />
      <Card className="space-y-3 p-4">
        <Field label="Do‘kon nomi">
          <Input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} />
        </Field>
        <Field label="Telefon">
          <Input value={form.store_phone} onChange={(e) => setForm({ ...form, store_phone: e.target.value })} />
        </Field>
        <Field label="Manzil">
          <Input value={form.store_address} onChange={(e) => setForm({ ...form, store_address: e.target.value })} />
        </Field>
        <Field label="Chek izohi">
          <Input value={form.receipt_footer} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} />
        </Field>
        <Field label="Kassadagi boshlang‘ich naqd">
          <Input value={form.opening_cash} onChange={(e) => setForm({ ...form, opening_cash: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.allow_negative_stock === "1"}
            onChange={(e) => setForm({ ...form, allow_negative_stock: e.target.checked ? "1" : "0" })}
          />
          Qoldiq minusga tushishiga ruxsat
        </label>
        <Button onClick={save}>Saqlash</Button>
        {msg ? <div className="text-sm text-ok">{msg}</div> : null}
      </Card>
      <Card className="space-y-3 p-4">
        <div className="font-bold">Valyuta va jihozlar</div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.usd_enabled === "1"}
            onChange={(e) => setForm({ ...form, usd_enabled: e.target.checked ? "1" : "0" })}
          />
          USD narx va to'lovni ko'rsatish
        </label>
        <Field label="USD kursi (1 USD = ? so'm)">
          <Input value={form.usd_rate} onChange={(e) => setForm({ ...form, usd_rate: e.target.value })} />
        </Field>
        <Field label="Termo printer IP (tarmoq)">
          <Input value={form.printer_ip} onChange={(e) => setForm({ ...form, printer_ip: e.target.value })} placeholder="192.168.1.100" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Printer port">
            <Input value={form.printer_port} onChange={(e) => setForm({ ...form, printer_port: e.target.value })} />
          </Field>
          <Field label="Chek kengligi (mm)">
            <Input value={form.printer_width} onChange={(e) => setForm({ ...form, printer_width: e.target.value })} />
          </Field>
        </div>
        <p className="text-xs text-muted">
          Termo printer ESC/POS (port 9100). Kassada «Chop etish» bosilganda avtomatik yuboriladi.
        </p>
      </Card>
      <Card className="space-y-3 p-4">
        <div className="font-bold">Fiskal QR chek</div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.fiscal_enabled === "1"}
            onChange={(e) => setForm({ ...form, fiscal_enabled: e.target.checked ? "1" : "0" })}
          />
          Chekda fiskal QR ko'rsatish
        </label>
        <Field label="STIR (INN)">
          <Input value={form.store_tin} onChange={(e) => setForm({ ...form, store_tin: e.target.value })} placeholder="123456789" />
        </Field>
        <Field label="Savdo nomi (fiskal)">
          <Input value={form.fiscal_merchant_name} onChange={(e) => setForm({ ...form, fiscal_merchant_name: e.target.value })} />
        </Field>
        <p className="text-xs text-muted">To'liq OFD integratsiyasi uchun soliq organi bilan shartnoma kerak. Hozir QR ichida chek ma'lumotlari saqlanadi.</p>
      </Card>
      <Card className="space-y-3 p-4">
        <div className="font-bold">SMS (Eskiz.uz)</div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.sms_enabled === "1"}
            onChange={(e) => setForm({ ...form, sms_enabled: e.target.checked ? "1" : "0" })}
          />
          SMS yuborish yoqilgan
        </label>
        <Field label="Eskiz email">
          <Input value={form.sms_email} onChange={(e) => setForm({ ...form, sms_email: e.target.value })} />
        </Field>
        <Field label="Eskiz parol">
          <Input type="password" value={form.sms_password} onChange={(e) => setForm({ ...form, sms_password: e.target.value })} />
        </Field>
        <Field label="Yuboruvchi nomi">
          <Input value={form.sms_sender} onChange={(e) => setForm({ ...form, sms_sender: e.target.value })} />
        </Field>
        <Button variant="ghost" onClick={() => save().then(() => testSms()).catch((e) => setMsg(e.message))}>
          Test SMS
        </Button>
      </Card>
      <Card className="space-y-3 p-4">
        <div className="font-bold">Offline rejim (PWA)</div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.offline_mode_enabled === "1"}
            onChange={(e) => setForm({ ...form, offline_mode_enabled: e.target.checked ? "1" : "0" })}
          />
          Internetsiz savdo navbatini saqlash
        </label>
        <p className="text-xs text-muted">Telefon/planshetga «Uy ekraniga qo'shish» qiling. Internet qaytganida «Sinxronlash» tugmasi paydo bo'ladi.</p>
      </Card>
      <Card className="space-y-3 p-4">
        <div className="font-bold">AI mahsulot (rasm orqali)</div>
        <Field label="OpenAI API kaliti">
          <Input
            type="password"
            value={form.openai_api_key}
            onChange={(e) => setForm({ ...form, openai_api_key: e.target.value })}
            placeholder="sk-..."
          />
        </Field>
        <p className="text-xs text-muted">
          Mahsulotlar → «Rasm orqali»: Telegram/WhatsApp skrinshotidan nom va narxni o‘qiydi, reklamabop rasm (narx yozuvi bilan) yasaydi. Kalit:{" "}
          <a className="underline" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
            platform.openai.com
          </a>
        </p>
        <Button onClick={save}>Saqlash</Button>
      </Card>
      <Card className="space-y-3 p-4">
        <div className="font-bold">Telegram yetkazib berish boti</div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.telegram_bot_enabled === "1"}
            onChange={(e) => setForm({ ...form, telegram_bot_enabled: e.target.checked ? "1" : "0" })}
          />
          Bot yoqilgan (mijoz / kuryer / admin)
        </label>
        <Field label="Admin chat ID lar (vergul bilan)">
          <Input
            value={form.telegram_admin_ids}
            onChange={(e) => setForm({ ...form, telegram_admin_ids: e.target.value })}
            placeholder="123456789"
          />
        </Field>
        <Field label="Kuryer chat ID lar">
          <Input
            value={form.telegram_courier_ids}
            onChange={(e) => setForm({ ...form, telegram_courier_ids: e.target.value })}
            placeholder="987654321"
          />
        </Field>
        <Field label="Standart yetkazish narxi (so‘m)">
          <Input
            value={form.delivery_fee_default}
            onChange={(e) => setForm({ ...form, delivery_fee_default: e.target.value })}
          />
        </Field>
        <Field label="Webhook secret (ixtiyoriy)">
          <Input
            value={form.telegram_webhook_secret}
            onChange={(e) => setForm({ ...form, telegram_webhook_secret: e.target.value })}
            placeholder="tasodifiy-parol"
          />
        </Field>
        <Field label="Ommaviy HTTPS manzil (ngrok va h.k.)">
          <Input
            value={form.telegram_webhook_url}
            onChange={(e) => setForm({ ...form, telegram_webhook_url: e.target.value })}
            placeholder="https://xxxx.ngrok-free.app"
          />
        </Field>
        <p className="text-xs text-muted">
          1) BotFather dan bot yarating, tokenni yuqoridagi «Bot token»ga yozing. 2) Botga /start yuboring — chat ID chiqadi.
          3) Admin/kuryer ID larni shu yerga qo‘ying. 4) Internetdan ochiladigan HTTPS manzil kerak (masalan Cloudflare Tunnel /
          ngrok), so‘ng «Webhook ulash».
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save}>Saqlash</Button>
          <Button variant="ghost" onClick={() => setWebhook().catch((e) => setMsg(e.message))}>
            Webhook ulash
          </Button>
          <Button variant="ghost" onClick={() => deleteWebhook().catch((e) => setMsg(e.message))}>
            Webhook o‘chirish
          </Button>
        </div>
      </Card>
      <Card className="space-y-3 p-4">
        <div className="font-bold">Telegram ogohlantirish</div>
        <Field label="Bot token">
          <Input value={form.telegram_bot_token} onChange={(e) => setForm({ ...form, telegram_bot_token: e.target.value })} />
        </Field>
        <Field label="Chat ID">
          <Input value={form.telegram_chat_id} onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })} />
        </Field>
        <Field label="Muddati yaqin (kun)">
          <Input value={form.expiry_alert_days} onChange={(e) => setForm({ ...form, expiry_alert_days: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.telegram_alerts_enabled === "1"}
            onChange={(e) => setForm({ ...form, telegram_alerts_enabled: e.target.checked ? "1" : "0" })}
          />
          Telegram ogohlantirish yoqilgan
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => save().then(() => testTelegram()).catch((e) => setMsg(e.message))}>
            Test xabar
          </Button>
          <Button variant="ghost" onClick={() => sendAlerts().catch((e) => setMsg(e.message))}>
            Ogohlantirish yuborish
          </Button>
        </div>
      </Card>
      <Card className="p-4">
        <div className="font-bold">Zaxira nusxa</div>
        <p className="mb-3 mt-1 text-sm text-muted">Barcha ma'lumotlarni JSON faylga yuklab oling yoki zaxiradan tiklang.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={backup}>
            Yuklab olish
          </Button>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold hover:bg-bg">
            Tiklash
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) restore(f).catch((err) => setMsg(err.message));
              }}
            />
          </label>
        </div>
      </Card>
      <Card className="border-red-200 p-4">
        <div className="font-bold text-danger">Namunaviy ma'lumotlarni tozalash</div>
        <p className="mb-3 mt-1 text-sm text-muted">
          Yangi do‘konni toza boshlash uchun: mahsulotlar, savdolar, smenalar, mijozlar, ta'minotchilar va qoldiqlar
          o‘chiriladi. Xodimlar, sozlamalar va toifalar saqlanadi. Oldin zaxira nusxa avtomatik yuklab olinadi.
        </p>
        <Button variant="danger" onClick={() => resetData().catch((e) => setMsg(e.message))}>
          Tozalash
        </Button>
      </Card>
      <Card className="p-4">
        <div className="font-bold">Windows avtomatik ishga tushish</div>
        <p className="mb-3 mt-1 text-sm text-muted">
          Kompyuter yoqilganda {PRODUCT_NAME} dasturini avtomatik ishga tushirish uchun loyiha papkasidagi{" "}
          <code className="rounded bg-bg px-1">scripts/install-windows-task.ps1</code> faylini administrator sifatida ishga tushiring.
        </p>
      </Card>
    </div>
  );
}
