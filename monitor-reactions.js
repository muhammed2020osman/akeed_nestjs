const mysql = require('mysql2/promise');

let lastReactionId = 0;

async function monitorReactions() {
    const connection = await mysql.createConnection({
        host: 'srv1756.hstgr.io',
        user: 'u939274745_slack_api',
        password: 'Ds|4[I2gTgF0',
        database: 'u939274745_slack_api'
    });

    console.log('👀 مراقبة التفاعلات الجديدة...');
    console.log('اضغط Ctrl+C للإيقاف\n');

    const [initial] = await connection.execute(
        'SELECT MAX(id) as max_id FROM message_reactions'
    );
    lastReactionId = initial[0].max_id || 0;
    console.log(`📊 آخر ID في قاعدة البيانات: ${lastReactionId}\n`);

    setInterval(async () => {
        try {
            const [newReactions] = await connection.execute(
                `SELECT r.id, r.message_id, r.user_id, r.icon as emoji, r.created_at, u.name as user_name 
         FROM message_reactions r 
         LEFT JOIN users u ON r.user_id = u.id 
         WHERE r.id > ? 
         ORDER BY r.id ASC`,
                [lastReactionId]
            );

            if (newReactions.length > 0) {
                newReactions.forEach(r => {
                    console.log(`🎉 تفاعل جديد!`);
                    console.log(`   ID: ${r.id}`);
                    console.log(`   الرسالة: ${r.message_id}`);
                    console.log(`   المستخدم: ${r.user_name || 'User ' + r.user_id}`);
                    console.log(`   Emoji: ${r.emoji}`);
                    console.log(`   الوقت: ${r.created_at}`);
                    console.log('   ' + '-'.repeat(60));

                    lastReactionId = r.id;
                });
            }
        } catch (err) {
            console.error('❌ خطأ:', err.message);
        }
    }, 2000); // تحقق كل ثانيتين
}

monitorReactions().catch(console.error);
