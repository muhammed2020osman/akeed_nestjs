const mysql = require('mysql2/promise');
const axios = require('axios');

const API_URL = 'https://drops-draw-understanding-usa.trycloudflare.com/api';
const TEST_MESSAGE_ID = 79; // رسالة موجودة للاختبار
const TEST_EMOJI = '🎉';

async function testReactionFlow() {
    console.log('🧪 بدء اختبار نظام التفاعلات (Reactions)\n');
    console.log('='.repeat(80));

    // الخطوة 1: الاتصال بقاعدة البيانات
    const connection = await mysql.createConnection({
        host: 'srv1756.hstgr.io',
        user: 'u939274745_slack_api',
        password: 'Ds|4[I2gTgF0',
        database: 'u939274745_slack_api'
    });
    console.log('✅ تم الاتصال بقاعدة البيانات\n');

    // الخطوة 2: التحقق من عدد التفاعلات قبل الإضافة
    const [beforeCount] = await connection.execute(
        'SELECT COUNT(*) as total FROM message_reactions WHERE message_id = ? AND icon = ?',
        [TEST_MESSAGE_ID, TEST_EMOJI]
    );
    console.log(`📊 عدد التفاعلات ${TEST_EMOJI} على الرسالة ${TEST_MESSAGE_ID} قبل الاختبار: ${beforeCount[0].total}\n`);

    // الخطوة 3: محاولة إضافة التفاعل (يحتاج token حقيقي)
    console.log('⚠️  ملاحظة: لاختبار إضافة التفاعل عبر API، تحتاج إلى:');
    console.log('   1. تسجيل الدخول في التطبيق');
    console.log('   2. الحصول على Authorization token');
    console.log('   3. إضافة التفاعل من خلال الواجهة\n');

    // الخطوة 4: عرض التفاعلات الحالية على هذه الرسالة
    const [reactions] = await connection.execute(
        'SELECT r.id, r.user_id, r.icon, r.created_at, u.name as user_name FROM message_reactions r LEFT JOIN users u ON r.user_id = u.id WHERE r.message_id = ? ORDER BY r.created_at DESC',
        [TEST_MESSAGE_ID]
    );

    console.log(`📋 التفاعلات الحالية على الرسالة ${TEST_MESSAGE_ID}:`);
    console.log('-'.repeat(80));
    if (reactions.length === 0) {
        console.log('   لا توجد تفاعلات على هذه الرسالة');
    } else {
        reactions.forEach((r, i) => {
            console.log(`   ${i + 1}. ${r.icon} بواسطة ${r.user_name || 'User ' + r.user_id} في ${r.created_at}`);
        });
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ الاختبار مكتمل!\n');
    console.log('📝 للتحقق من عمل النظام:');
    console.log('   1. افتح التطبيق في المتصفح (http://localhost:3001)');
    console.log('   2. اذهب إلى القناة التي تحتوي على الرسالة رقم ' + TEST_MESSAGE_ID);
    console.log('   3. أضف تفاعل على الرسالة');
    console.log('   4. شغّل هذا السكريبت مرة أخرى للتحقق من الحفظ\n');

    await connection.end();
}

testReactionFlow().catch(err => {
    console.error('❌ خطأ:', err.message);
    process.exit(1);
});
