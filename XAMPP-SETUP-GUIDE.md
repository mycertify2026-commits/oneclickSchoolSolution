# One Click School Solutions — घरी XAMPP (MySQL) वर चालवण्याची पद्धत

हा software आता **दोन्ही database वर चालतो**:
- Replit वर → PostgreSQL (आपोआप, काही करायची गरज नाही)
- तुमच्या computer वर → MySQL (XAMPP/WAMP)

## लागणाऱ्या गोष्टी
1. **XAMPP** (Apache + MySQL) — https://www.apachefriends.org
2. **Node.js** (LTS version) — https://nodejs.org

## Step 1: Code download करा
GitHub वरून: https://github.com/janhavikhonde2010/school → **Code → Download ZIP** → unzip करा.

## Step 2: Database तयार करा
1. XAMPP Control Panel मध्ये **MySQL → Start** करा
2. Browser मध्ये उघडा: `http://localhost/phpmyadmin`
3. डावीकडे **New** → database नाव `certifypro` → Collation `utf8mb4_general_ci` → **Create**
4. `certifypro` database निवडा → वरती **Import** tab →
   - आधी file निवडा: `backend/src/config/schema.mysql.sql` → **Go** (tables तयार होतील)
   - मग परत Import → `backend/src/config/data.mysql.sql` → **Go** (तुमचा सगळा data येईल)

## Step 3: Backend सुरू करा
Project folder मध्ये Command Prompt उघडा:

```
cd backend
copy .env.xampp .env
```

बस्स! `.env.xampp` मध्ये XAMPP च्या सगळ्या settings आधीच भरलेल्या आहेत (DB_TYPE=mysql, localhost, root, इ.).
तुमच्या MySQL ला password असेल तरच `backend\.env` उघडून `DB_PASSWORD=` मध्ये तो टाका — XAMPP मध्ये सहसा रिकामा असतो.

मग:

```
npm install
npm run dev
```

`One Click School Solutions backend running on http://localhost:3001` दिसलं की backend तयार!

## Step 4: Frontend सुरू करा
दुसरं Command Prompt उघडा:

```
cd frontend
npm install
npm start
```

Browser मध्ये `http://localhost:3000` उघडेल — तेच login, तोच data!

## अडचणी आल्या तर
| समस्या | उपाय |
|---|---|
| `ECONNREFUSED 3306` | XAMPP मध्ये MySQL Start केलं का ते बघा |
| `ER_ACCESS_DENIED` | `.env` मधला DB_USER/DB_PASSWORD तपासा |
| `ER_BAD_DB_ERROR` | phpMyAdmin मध्ये `certifypro` database तयार केला का? |
| Email जात नाहीत | `.env` मध्ये SMTP settings भरा (Gmail App Password लागतो) |
