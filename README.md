# NestJS Backend

مشروع NestJS مطابق 100% لبنية Laravel API الحالية.

## الميزات

- ✅ TypeORM مع MySQL
- ✅ JWT Authentication
- ✅ Validation باستخدام class-validator
- ✅ Response Interceptor (بنية Laravel)
- ✅ Exception Filter (بنية Laravel)
- ✅ CORS Configuration
- ✅ Global API Prefix (`/api`)

## الإعداد

### 1. تثبيت الحزم

```bash
npm install
```

### 2. إعداد ملف `.env`

انسخ `.env.example` إلى `.env` وعدّل القيم:

```env
# Application
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# Database
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=
DB_DATABASE=laravel

# JWT
JWT_SECRET=your-secret-key-change-this-in-production
JWT_EXPIRES_IN=3600s

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:8000
```

### 3. تشغيل المشروع

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## بنية Response

جميع الـ APIs ترجع بنية موحدة مطابقة لـ Laravel:

### Success Response
```json
{
  "success": true,
  "payload": {...},
  "message": "Request successful",
  "status": 200
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message",
  "payload": null,
  "status": 400
}
```

### Validation Error Response
```json
{
  "success": false,
  "message": "Validation failed",
  "payload": {
    "errors": {
      "email": ["The email field is required."],
      "password": ["The password must be at least 6 characters."]
    }
  },
  "status": 422
}
```

## Authentication

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "password123"
}
```

### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

### Protected Routes
استخدم `Authorization: Bearer <token>` في الـ headers.

## الهيكل

```
src/
├── auth/              # Authentication module
│   ├── dto/          # Data Transfer Objects
│   ├── guards/       # JWT Guards
│   └── strategies/   # Passport Strategies
├── common/           # Shared utilities
│   ├── decorators/   # Custom decorators
│   ├── exceptions/   # Custom exceptions
│   ├── filters/      # Exception filters
│   └── interceptors/ # Response interceptors
├── config/           # Configuration files
├── database/         # Database module
└── main.ts           # Application entry point
```

## ملاحظات

- المشروع يستخدم نفس قاعدة البيانات مع Laravel
- جميع الـ APIs تستخدم نفس بنية Response
- Status Codes مطابقة لـ Laravel (200, 201, 401, 403, 404, 422, 500)
- CORS مُعد ليتوافق مع Laravel configuration
