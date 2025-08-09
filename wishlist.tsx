import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { X, Plus, RefreshCw, Link as LinkIcon } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Servise-ønskeliste med pris-sjekk
 * ---------------------------------
 * Frontend (React + Tailwind + shadcn/ui)
 *
 * Hva den gjør nå:
 *  - Legg til servisedeler med ønsket antall og hva dere allerede har
 *  - Fargekodet status (OK / mangler)
 *  - Lokal lagring i browser (localStorage)
 *  - Sjekk beste pris via en backend-endepunkt (du plugger inn senere)
 *  - Auto-refresh pris med intervall
 *
 * Hva du må koble til selv:
 *  - Et backend-endepunkt på /api/best-price som returnerer { price, currency, vendor, url }
 *    basert på provider (prisjakt | klarna | auto) og query/url.
 *
 * Se forslag til backend i chatten.
 */

// Typer
type Provider = "auto" | "prisjakt" | "klarna";

type Item = {
  id: string;
  name: string;
  have: number;
  want: number;
  query: string; // produktnavn, EAN/GTIN eller lenke til produktside
  provider: Provider;
  bestPriceNOK?: number | null;
  vendor?: string | null;
  offerUrl?: string | null;
  currency?: string | null;
  lastChecked?: string | null; // ISO-dato
};

// Utils
const NOK = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("nb-NO", { style: "currency", currency: "NOK" }) : "—";

const missingFor = (i: Item) => Math.max(0, (i.want || 0) - (i.have || 0));

const STORAGE_KEY = "servise_wishlist_v1";

function loadItems(): Item[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // litt robusthet for eldre strukturer
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveItems(items: Item[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function ServiseWishlist() {
  const [items, setItems] = useState<Item[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [intervalMin, setIntervalMin] = useState(30);

  // Skjema state
  const [name, setName] = useState("");
  const [have, setHave] = useState<number | "">("");
  const [want, setWant] = useState<number | "">("");
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<Provider>("auto");

  useEffect(() => {
    setItems(loadItems());
  }, []);

  useEffect(() => {
    saveItems(items);
  }, [items]);

  // Auto-refresh pris
  useEffect(() => {
    if (!autoRefresh) return;
    const ms = Math.max(1, intervalMin) * 60 * 1000;
    const timer = setInterval(() => {
      handleCheckAllPrices();
    }, ms);
    return () => clearInterval(timer);
  }, [autoRefresh, intervalMin, items]);

  const totals = useMemo(() => {
    const missing = items.reduce((acc, i) => acc + missingFor(i), 0);
    const estimate = items.reduce((acc, i) => {
      const m = missingFor(i);
      const p = i.bestPriceNOK ?? 0;
      return acc + (m > 0 && p > 0 ? m * p : 0);
    }, 0);
    return { missing, estimate };
  }, [items]);

  function addItem() {
    if (!name.trim()) return;
    const newItem: Item = {
      id: crypto.randomUUID(),
      name: name.trim(),
      have: typeof have === "number" ? have : 0,
      want: typeof want === "number" ? want : 0,
      query: query.trim(),
      provider,
    };
    setItems((prev) => [newItem, ...prev]);
    setName("");
    setHave("");
    setWant("");
    setQuery("");
    setProvider("auto");
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function updateItem(id: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function checkPrice(i: Item) {
    setLoadingId(i.id);
    try {
      // Forventet backend: /api/best-price?provider=..&q=..
      const params = new URLSearchParams({ provider: i.provider, q: i.query || i.name });
      const res = await fetch(`/api/best-price?${params.toString()}`);
      if (!res.ok) throw new Error("Kunne ikke hente pris");
      const data = await res.json();
      // Forventer: { price: number, currency: 'NOK', vendor: string, url: string }
      updateItem(i.id, {
        bestPriceNOK: data.currency === "NOK" ? data.price : data.convertedNOK ?? null,
        currency: data.currency ?? "NOK",
        vendor: data.vendor ?? null,
        offerUrl: data.url ?? null,
        lastChecked: new Date().toISOString(),
      });
    } catch (e) {
      console.error(e);
      updateItem(i.id, { bestPriceNOK: null, vendor: null, offerUrl: null, lastChecked: new Date().toISOString() });
    } finally {
      setLoadingId(null);
    }
  }

  async function handleCheckAllPrices() {
    for (const i of items) {
      await checkPrice(i);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-semibold tracking-tight">Servise-ønskeliste</h1>
        <p className="text-sm text-muted-foreground">Hold oversikt over hva dere mangler – og finn beste pris fortløpende.</p>
      </motion.div>

      {/* Legg til nytt */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Legg til del</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <Label>Navn</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Middagstallerken" />
          </div>
          <div className="md:col-span-2">
            <Label>Har</Label>
            <Input type="number" value={have} onChange={(e) => setHave(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          <div className="md:col-span-2">
            <Label>Ønsker</Label>
            <Input type="number" value={want} onChange={(e) => setWant(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          <div className="md:col-span-3">
            <Label>Søkeord / lenke</Label>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="f.eks. Royal Copenhagen tallerken 27 cm" />
          </div>
          <div className="md:col-span-2">
            <Label>Pris-kilde</Label>
            <Select value={provider} onValueChange={(v: Provider) => setProvider(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Velg" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="prisjakt">Prisjakt</SelectItem>
                <SelectItem value="klarna">Klarna</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-12 flex gap-2">
            <Button onClick={addItem}><Plus className="h-4 w-4 mr-1" />Legg til</Button>
            <Button variant="secondary" onClick={handleCheckAllPrices}><RefreshCw className="h-4 w-4 mr-1" />Sjekk priser for alle</Button>
          </div>
        </CardContent>
      </Card>

      {/* Innstillinger */}
      <Card>
        <CardContent className="py-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <span>Auto-sjekk priser</span>
          </div>
          <div className="flex items-center gap-2">
            <Label>Intervall (min)</Label>
            <Input className="w-24" type="number" value={intervalMin} onChange={(e) => setIntervalMin(Math.max(1, Number(e.target.value || 1)))} />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Badge variant="secondary">Mangler totalt: {totals.missing}</Badge>
            <Badge>Estimert total: {NOK(totals.estimate)}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Liste */}
      <div className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">Ingen deler enda. Legg til den første over! ✨</p>
        )}
        {items.map((i) => {
          const missing = missingFor(i);
          const ok = missing === 0;
          return (
            <motion.div key={i.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
              <Card className={ok ? "border-green-200" : missing > 0 ? "border-red-200" : ""}>
                <CardContent className="p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-3">
                    <Label className="text-xs">Del</Label>
                    <Input value={i.name} onChange={(e) => updateItem(i.id, { name: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Har</Label>
                    <Input type="number" value={i.have} onChange={(e) => updateItem(i.id, { have: Number(e.target.value || 0) })} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Ønsker</Label>
                    <Input type="number" value={i.want} onChange={(e) => updateItem(i.id, { want: Number(e.target.value || 0) })} />
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-xs">Søkeord / lenke</Label>
                    <Input value={i.query} onChange={(e) => updateItem(i.id, { query: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Pris-kilde</Label>
                    <Select value={i.provider} onValueChange={(v: Provider) => updateItem(i.id, { provider: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="prisjakt">Prisjakt</SelectItem>
                        <SelectItem value="klarna">Klarna</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    <div className="md:col-span-3">
                      <Badge variant={ok ? "secondary" : "destructive"}>{ok ? "Komplett" : `Mangler ${missing}`}</Badge>
                    </div>
                    <div className="md:col-span-3 text-sm">
                      <div className="text-muted-foreground">Beste pris</div>
                      <div className="font-medium">{NOK(i.bestPriceNOK ?? null)}</div>
                    </div>
                    <div className="md:col-span-2 text-sm">
                      <div className="text-muted-foreground">Forhandler</div>
                      <div className="font-medium">{i.vendor || "—"}</div>
                    </div>
                    <div className="md:col-span-2 text-sm">
                      <div className="text-muted-foreground">Sist sjekket</div>
                      <div className="font-medium">{i.lastChecked ? new Date(i.lastChecked).toLocaleString("nb-NO") : "—"}</div>
                    </div>
                    <div className="md:col-span-2 flex gap-2 justify-end">
                      {i.offerUrl && (
                        <a className="inline-flex" href={i.offerUrl} target="_blank" rel="noreferrer">
                          <Button variant="outline" size="sm"><LinkIcon className="h-4 w-4 mr-1" />Til tilbud</Button>
                        </a>
                      )}
                      <Button size="sm" onClick={() => checkPrice(i)} disabled={loadingId === i.id}>
                        <RefreshCw className="h-4 w-4 mr-1" /> {loadingId === i.id ? "Sjekker…" : "Sjekk pris"}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => removeItem(i.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Fotnote */}
      <p className="text-xs text-muted-foreground">
        Merk: Prissjekk krever et backend-endepunkt. Sørg for å følge vilkår for bruk når du henter priser fra tredjepart (Prisjakt/Klarna).
      </p>
    </div>
  );
}
