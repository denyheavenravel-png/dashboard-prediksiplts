# Dashboard Prediksi Daya PLTS Mini

Dashboard Next.js ini berjalan mandiri menggunakan data simulasi. Belum membutuhkan ESP32, HiveMQ, Docker, database, atau backend.

## Menjalankan di komputer

1. Instal Node.js versi LTS.
2. Buka terminal pada folder proyek.
3. Jalankan:

```bash
npm install
npm run dev
```

4. Buka `http://localhost:3000`.

## Deploy ke Vercel

1. Upload folder ini ke repository GitHub.
2. Masuk Vercel dan pilih **Add New Project**.
3. Import repository tersebut.
4. Framework akan terdeteksi sebagai **Next.js**.
5. Klik **Deploy**.
6. Tambahkan domain `prediksiplts.my.id` pada **Settings > Domains**.

Dashboard tidak membutuhkan environment variable selama masih menggunakan mode demo.

## Data yang ditampilkan

- Status dashboard dan simulasi
- Tegangan panel
- Arus panel
- Daya aktual
- Daya prediksi
- Error prediksi
- Intensitas cahaya
- Suhu
- Kelembapan
- Grafik aktual dan prediksi
- Metrik contoh JST
- Tabel riwayat
- Unduh CSV demo

## Tahap integrasi berikutnya

Pada tahap berikutnya, data simulasi pada `components/Dashboard.tsx` dapat diganti dengan data API backend dari ESP32 dan HiveMQ.
