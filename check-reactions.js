const mysql = require('mysql2/promise');

async function checkReactions() {
    const connection = await mysql.createConnection({
        host: 'srv1756.hstgr.io',
        user: 'u939274745_slack_api',
        password: 'Ds|4[I2gTgF0',
        database: 'u939274745_slack_api'
    });

    console.log('✅ Connected to database');

    const [reactions] = await connection.execute(
        'SELECT id, message_id, user_id, icon as emoji, created_at FROM message_reactions ORDER BY created_at DESC LIMIT 10'
    );

    console.log('\n📊 آخر 10 تفاعلات في قاعدة البيانات:');
    console.log('='.repeat(80));

    if (reactions.length === 0) {
        console.log('❌ لا توجد تفاعلات في قاعدة البيانات');
    } else {
        reactions.forEach((r, i) => {
            console.log(`${i + 1}. ID: ${r.id} | Message: ${r.message_id} | User: ${r.user_id} | Emoji: ${r.emoji} | Time: ${r.created_at}`);
        });
    }

    const [count] = await connection.execute(
        'SELECT COUNT(*) as total FROM message_reactions'
    );
    console.log('\n📈 إجمالي عدد التفاعلات:', count[0].total);

    await connection.end();
}

checkReactions().catch(console.error);
