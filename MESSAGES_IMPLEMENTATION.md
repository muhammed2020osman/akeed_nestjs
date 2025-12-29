# NestJS Messages Implementation

## Overview
تم تنفيذ نظام الرسائل الكامل في NestJS بنفس هيكلية Laravel ونفس قاعدة البيانات.

## Features
- ✅ CRUD operations للرسائل
- ✅ WebSocket real-time عبر Socket.IO
- ✅ Channel authorization
- ✅ نفس response format مثل Laravel
- ✅ نفس endpoints مثل Laravel

## API Endpoints

### Messages
- `GET /api/messages` - جلب جميع الرسائل
- `POST /api/messages` - إنشاء رسالة جديدة
- `GET /api/messages/:id` - جلب رسالة واحدة
- `PUT /api/messages/:id` - تحديث رسالة
- `DELETE /api/messages/:id` - حذف رسالة
- `GET /api/messages/threads` - جلب المواضيع
- `GET /api/messages/starred` - جلب الرسائل المفضلة

### Channels
- `GET /api/channels/:id/messages` - جلب رسائل القناة
- `GET /api/channels/:id/search` - البحث في رسائل القناة

## WebSocket Events

### Channel Subscription
```typescript
socket.emit('subscribe:channel', { channelId: 1 });
```

### Events
- `message.sent` - عند إرسال رسالة جديدة
- `message.updated` - عند تحديث رسالة
- `message.deleted` - عند حذف رسالة

## Configuration

### Environment Variables
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=
DB_DATABASE=laravel
JWT_SECRET=your-secret-key
PORT=3000
```

### JWT Secret
يجب أن يكون JWT_SECRET في NestJS نفس JWT_SECRET في Laravel للعمل مع نفس tokens.

## Android Integration

### Switch Backend
في `android/lib/core/config/api_urls.dart`:
```dart
static const String backendType = 'nestjs'; // Change from 'laravel' to 'nestjs'
```

### WebSocket
WebSocket Service يدعم تلقائياً Socket.IO عند استخدام NestJS backend.

## Testing

### Start NestJS
```bash
cd nestjs
npm run start:dev
```

### Test Endpoints
```bash
# Get messages
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/messages

# Create message
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello","channelId":1}' \
  http://localhost:3000/api/messages
```

## Notes
- NestJS يستخدم نفس قاعدة البيانات MySQL مثل Laravel
- Authentication يتم من Laravel فقط
- NestJS يتحقق من نفس JWT tokens من Laravel
- WebSocket يستخدم Socket.IO بدلاً من Pusher

