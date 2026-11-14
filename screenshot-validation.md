# Screenshot validation — token-radar-01 v2

## Status: PASS — semua 3 shot v2 terverifikasi visual

v2 dibangun di salinan `~/workspace/makefun/token-radar-01-v2/` (v1 di
`~/workspace/makefun/token-radar-01/` tidak disentuh — file-file v1 masih
berstempel 14 Nov 11:00, ukuran asli). `out/` diregenerasi dengan main.ts
(`MAKEFUN_OUTPUT_DIR=out node main.ts --input
~/workspace/makefun/token-radar-01-kit/input/snapshot.json`): 758 protocols,
40 watchlist, 226 rows scored (186 early, 24 live set aside), model
radar-2-comps, top implied value $396.662.979 (steakhouse-financial).
`out/screenshots/` md5-identik dengan `screenshots/` final.

## Perubahan v2 vs v1 (yang diperbaiki)

1. **Kolom Farm di board** — tiap baris menampilkan ringkasan farm
   (`$<modal> · <hold>d · 6 steps`), dihitung client-side dari TVL/umur
   baris via `capitalFor`/`holdDaysFor` yang sudah ada di `app.js`
   (model tidak diubah, `board.json` tidak diubah). Header "Farm" terlihat
   dan bisa di-sort.
2. **Board lebih padat** — padding sel 12px → 6px vertikal / 10px
   horizontal, nama + sub satu baris dengan ellipsis (max-width 160px),
   bar implied 110px → 72px, padding lede/controls dirapatkan.
   Hasil ukur CDP: baris 53px, **8 baris penuh terlihat** dalam 900px
   (v1: 6), tanpa overflow horizontal (table scrollWidth = wrap clientWidth
   = 898px).
3. **Detail panel direstrukturisasi** — urutan baru: head → "Farm plan at a
   glance" (Capital / Est. gas total / Hold / Steps + 2 langkah pertama
   lengkap dengan cost & time) → Facts → Model breakdown → Comparables →
   6 langkah penuh. Ukur CDP: langkah mini ke-2 berakhir di y=838
   (< 900px) — ringkasan farm + 2 langkah pertama terlihat penuh.
   Head detail juga dipersingkat (chains max 4 + "+N") dan padding panel
   dirapatkan.
4. **Facts grid diperbaiki** — label dipendekkan ("7-day change" →
   "7d change", "Age with no token" → "No-token age", "Implied value" →
   "Implied") + `white-space:nowrap` pada label dan nilai; label lede
   "Top implied value" → "Top implied" + nowrap.
5. **Methodology: blok "How to verify this entry"** — faktual: cover
   watchlist 40/40 + 200 early rows; model = fungsi `impliedValue` di
   `lib/model.ts` dari TVL, 7d growth, umur; farm steps diturunkan dari
   kategori/chains/TVL/umur; tidak ada nama yang di-special-case; cara
   mereproduksi via main.ts + recompute di detail panel.
6. **Batas** — total source dashboard 53.085 byte (< cap 65.536);
   `grep http` = 0 di ketiga file; `lib/model.ts` dan `main.ts` tidak
   diubah.

## Hasil validate-shots.py (final, 1440x900, PNG)

| Shot | File | Dimensi | Ukuran | Non-blank (stdev) | Visual |
|---|---|---|---|---|---|
| 1-board | `screenshots/1-board.png` | 1440x900 | 250.091 B (244 KiB) | stdev 15,1 | OK — 8 baris penuh (rank 1–8), kolom Farm terlihat di semua baris ("$150 · 30d · 6 steps", "$100 · 60d · 6 steps"), header Farm terlihat, "Top implied" satu baris, "226 of 226 rows shown" |
| 2-detail | `screenshots/2-detail.png` | 1440x900 | 293.141 B (286 KiB) | stdev 16,6 | OK — Steakhouse Financial rank 1, "Farm plan at a glance": Capital $150, Est. gas total ≈$19, Hold 30 days, Steps 6; langkah 1 + 2 lengkap dengan Cost/Time terlihat penuh; catatan estimasi gas terlihat |
| 3-filtered | `screenshots/3-filtered.png` | 1440x900 | 256.196 B (250 KiB) | stdev 15,3 | OK — filter Risk Curators, "33 of 226 rows shown", rank 1, 2, 9, 12, 13, 15, 21, 30; kolom Farm terlihat |

`validate-shots.py screenshots/` → **RESULT: PASS** (semua ≤ 512 KiB, PNG,
tidak perlu JPEG).

## Verifikasi angka (konsistensi screenshot ↔ code)

- Farm board rank 1 (Steakhouse Financial, TVL $2,75B → tier $150; umur
  1,5y → hold 30d; 6 steps) cocok dengan `capitalFor`/`holdDaysFor` di
  `app.js` dan dengan glance detail ($150 / 30 days / 6 steps).
- Estimasi gas total glance ≈$19 = $3 (first tx) + $6 (gasFor tier $150)
  + $2 × 5 minggu (hold 30d) — sesuai tier gas di `lib/model.ts`.
- Detail langkah 2 ("Deposit $150 into a Steakhouse Financial vault… Cost:
  $150 of capital and about $6 of gas") cocok dengan template curator di
  `lib/model.ts`.
- Blocker v1 (placeholder "Select a protocol" menumpuk karena
  `.detail-empty{display:grid}` mengalahkan `[hidden]`) SUDAH diperbaiki
  di v1 via `.detail-empty[hidden]{display:none}` dan tetap ada di v2 —
  shot detail menampilkan isi detail tanpa placeholder.

## Tooling (terbukti, sama seperti v1)

- `/opt/meta-chromium/chrome` headless persisten + `--remote-debugging-port=9222`
  + CDP `Page.captureScreenshot` via Node 24 (`cdp-shot.mjs`); policy file
  `/tmp/webgl-policy.txt` dibuat ulang `capture.sh` bila hilang.
- Catatan: instance Chrome CDP mati antar-sesi — `capture.sh` me-restart-nya
  otomatis bila port 9222 tidak menjawab; `/tmp/measure.mjs` (skrip ukur
  sekali pakai) juga hilang antar-sesi dan harus ditulis ulang bila
  dibutuhkan lagi.
- Skrip: `capture.sh`, `cdp-shot.mjs`, `validate-shots.py`. Semua di repo
  dir, TIDAK ikut submit (main.ts hanya copy `dashboard/` + `screenshots/`).

## Yang BELUM dilakukan (di luar wewenang task ini)

- TIDAK submit, TIDAK buat repo GitHub, TIDAK push (sesuai larangan task).
