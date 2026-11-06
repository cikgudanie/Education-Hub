# Panduan Pasang Education Hub di Windows VPS (Percuma)

Anggaran masa: **15 hingga 20 minit**. Kos: **RM0**, kerana anda guna VPS sedia ada dan domain percuma DuckDNS.

Hasil akhir: pelajar buka `https://namaanda.duckdns.org`, daftar akaun, rekod trade dan hantar laporan. Anda log masuk sebagai mentor untuk melihat semua data.

---

## Langkah 1: Dapatkan alamat IP VPS anda

Alamat IP biasanya tertera di panel penyedia VPS, contohnya `103.xx.xx.xx`.
Cara lain: dalam VPS, buka PowerShell dan taip:
```powershell
Invoke-RestMethod https://api.ipify.org
```
Catat IP ini.

## Langkah 2: Dapatkan domain percuma dari DuckDNS

1. Buka **https://www.duckdns.org** (boleh guna komputer atau telefon sendiri).
2. Log masuk dengan **Google** (butang di atas kanan).
3. Di ruang **sub domain**, taip nama pilihan anda, contohnya `cikgutrading`, kemudian klik **add domain**.
4. Pada baris domain baru itu, isi ruang **current ip** dengan IP VPS dari Langkah 1, kemudian klik **update ip**.

Domain anda ialah **`cikgutrading.duckdns.org`**. Ia biasanya aktif dalam beberapa minit.

> IP VPS biasanya tetap, jadi anda tak perlu kemas kini lagi. Jika IP VPS berubah, ulang langkah 4.

## Langkah 3: Buka port 80 dan 443 di panel penyedia VPS

Sesetengah penyedia VPS ada firewall sendiri (dipanggil *Security Group*, *Firewall* atau *Network Rules*) di panel web mereka.
Tambah peraturan **Inbound** untuk:
- **TCP 80** (HTTP), dibenarkan dari mana-mana (`0.0.0.0/0`)
- **TCP 443** (HTTPS), dibenarkan dari mana-mana (`0.0.0.0/0`)

Jika penyedia anda tiada firewall seperti ini, langkau langkah ini. Firewall Windows akan dibuka secara automatik oleh skrip.

## Langkah 4: Jalankan pemasang di VPS

1. Sambung ke VPS melalui **Remote Desktop**.
2. Klik **Start**, taip `PowerShell`, klik kanan **Windows PowerShell**, dan pilih **Run as administrator**.
3. Salin dan tampal **semua** arahan di bawah, kemudian tekan **Enter**:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; [Net.ServicePointManager]::SecurityProtocol = 'Tls12'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/cikgudanie/Education-Hub/claude/hello-o2npie/deploy/windows/pasang.ps1' -OutFile "$env:TEMP\pasang.ps1"; & "$env:TEMP\pasang.ps1"
```

4. Skrip akan bertanya:
   - **Domain**: taip domain DuckDNS anda, contohnya `cikgutrading.duckdns.org`.
   - **Kata laluan mentor**: cipta kata laluan, sekurang-kurangnya 8 aksara. **Simpan baik-baik.**
5. Tunggu 3 hingga 5 minit sehingga keluar **SIAP!**

## Langkah 5: Uji

1. Dari telefon atau komputer sendiri, buka `https://cikgutrading.duckdns.org`. Pada kali pertama, sijil HTTPS mungkin mengambil 1 hingga 2 minit.
2. Klik **Daftar** dan cipta akaun pelajar ujian.
3. Rekod satu trade dan lihat dashboard.
4. Buka `https://cikgutrading.duckdns.org/guru/login` dan log masuk dengan kata laluan mentor.

Jika semuanya berjalan, kongsi alamat itu dengan pelajar anda.

---

## Pengurusan harian

| Tugasan | Cara |
|---|---|
| **Kemas kini sistem** | Jalankan semula arahan di Langkah 4. Data pelajar kekal. |
| **Tukar kata laluan mentor** | `& "$env:TEMP\pasang.ps1" -TukarKataLaluan` (PowerShell sebagai Administrator) |
| **Pelajar lupa kata laluan** | Log masuk mentor, buka profil pelajar, dan klik "Tetapkan semula kata laluan pelajar" |
| **Lokasi database** | `C:\EducationHub\data\reports.db` |
| **Backup automatik** | `C:\EducationHub\backup\` (setiap hari jam 2 pagi, 30 salinan terbaru) |
| **Log ralat** | `C:\EducationHub\logs\app.log` dan `caddy.log` |
| **Mula semula sistem** | Restart VPS. Sistem akan hidup sendiri. |

> Disyorkan: salin folder `C:\EducationHub\backup` ke Google Drive atau komputer anda sekali-sekala, sebagai backup di luar VPS.

## Masalah biasa

**Laman tidak boleh dibuka atau "This site can't be reached"**
- Semak bahawa IP di duckdns.org sama dengan IP VPS.
- Semak bahawa port 80 dan 443 dibuka di panel penyedia VPS (Langkah 3).
- Semak `C:\EducationHub\logs\caddy.log`.

**Pemasang berkata "Port 80/443 sedang digunakan"**
Biasanya ini IIS. Jika anda tidak guna IIS, jalankan arahan di bawah dan cuba lagi:
```powershell
Stop-Service W3SVC; Set-Service W3SVC -StartupType Disabled
```

**Amaran sijil atau "Not secure"**
Tunggu 2 minit dan muat semula halaman. Jika masih berlaku, semak `caddy.log`. Biasanya puncanya port 80 tertutup atau domain belum menghala ke VPS.

## Nyahpasang
```powershell
Get-ScheduledTask -TaskPath '\EducationHub\' | Stop-ScheduledTask
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*C:\EducationHub*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-ScheduledTask -TaskPath '\EducationHub\' | Unregister-ScheduledTask -Confirm:$false
Get-NetFirewallRule -DisplayName 'Education Hub*' | Remove-NetFirewallRule
# Kemudian padam folder C:\EducationHub. Backup data dahulu jika perlu!
```
