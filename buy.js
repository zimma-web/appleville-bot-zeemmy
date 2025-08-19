(() => {
    'use strict';

    // Simple Buy Test for AppleVille
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');

    // CONFIG
    const BASE = 'https://app.appleville.xyz/api/trpc';
    const COOKIE_FILE = path.join(__dirname, 'akun.txt');

    // Load cookie
    let COOKIE = '';
    try {
        COOKIE = fs.readFileSync(COOKIE_FILE, 'utf8').trim();
        if (!COOKIE || COOKIE.length < 20) {
            console.error('❌ Cookie tidak ditemukan atau tidak valid di akun.txt');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ File akun.txt tidak ditemukan');
        process.exit(1);
    }

    console.log('✅ Cookie loaded from akun.txt');

    // SIGNATURE GENERATOR
    async function generateSignature(inputPayload) {
        const SECRET_KEY = "aspih0f7303f0248gh204429g24d9jah9dsg97h9!eda";
        const timestamp = Date.now();
        const nonce = crypto.randomBytes(16).toString('hex');
        const payloadString = JSON.stringify(inputPayload ?? {});
        const message = `${timestamp}.${nonce}.${payloadString}`;
        const signature = crypto.createHmac('sha256', SECRET_KEY).update(message, 'utf8').digest('hex');
        return { signature, timestamp, nonce };
    }

    async function mutationHeaders(payload) {
        try {
            const { signature, timestamp, nonce } = await generateSignature(payload);
            return {
                'x-meta-hash': signature,
                'x-client-time': String(timestamp),
                'x-trace-id': nonce
            };
        } catch {
            return {};
        }
    }

    // SIMPLE BUY FUNCTION
    async function testBuy(key, quantity, type) {
        console.log(`\n🛒 Testing buy: ${key} x${quantity} (${type})`);

        const purchases = [{ key, quantity, type }];
        const payload = { purchases };

        console.log(`📤 Payload:`, JSON.stringify(payload, null, 2));

        const url = `${BASE}/core.buyItem?batch=1`;
        const requestBody = { 0: { json: payload } };

        console.log(`📤 Full request body:`, JSON.stringify(requestBody, null, 2));

        try {
            const headers = await mutationHeaders(payload);
            console.log(`🔐 Generated headers:`, headers);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'content-type': 'application/json',
                    'cookie': COOKIE,
                    'origin': 'https://app.appleville.xyz',
                    'referer': 'https://app.appleville.xyz/',
                    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'trpc-accept': 'application/json',
                    'x-trpc-source': 'nextjs-react',
                    ...headers,
                },
                body: JSON.stringify(requestBody),
            });

            console.log(`📥 Response status: ${response.status} ${response.statusText}`);

            const responseText = await response.text();
            console.log(`📥 Raw response:`, responseText);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Try to parse response
            let parsed;
            try {
                parsed = JSON.parse(responseText);
            } catch {
                // Try parsing as JSONL (multiple JSON objects)
                const lines = responseText.split('\n').filter(line => line.trim());
                if (lines.length > 0) {
                    parsed = JSON.parse(lines[lines.length - 1]);
                }
            }

            console.log(`📥 Parsed response:`, JSON.stringify(parsed, null, 2));

            // Check for errors
            if (parsed?.error || parsed?.[0]?.error) {
                const error = parsed?.error || parsed?.[0]?.error;
                console.log(`❌ API Error:`, error);
                return false;
            }

            // Look for success data
            const result = parsed?.result?.data?.json || parsed?.[0]?.result?.data?.json;
            if (result) {
                console.log(`✅ Purchase successful!`);
                console.log(`📊 Result:`, JSON.stringify(result, null, 2));
                return true;
            } else {
                console.log(`⚠️  Unexpected response format`);
                return false;
            }

        } catch (error) {
            console.log(`❌ Request failed:`, error.message);
            return false;
        }
    }

    // GET CURRENT STATE (for balance check)
    async function getBalance() {
        console.log('\n💰 Checking current balance...');

        try {
            const response = await fetch(`${BASE}/auth.me,core.getState?batch=1`, {
                method: 'GET',
                headers: {
                    'accept': 'application/json',
                    'cookie': COOKIE,
                    'origin': 'https://app.appleville.xyz',
                    'referer': 'https://app.appleville.xyz/',
                    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'trpc-accept': 'application/json',
                    'x-trpc-source': 'nextjs-react',
                },
            });

            const text = await response.text();
            const data = JSON.parse(text);

            if (Array.isArray(data) && data.length >= 2) {
                const user = data[0]?.result?.data?.json;
                const state = data[1]?.result?.data?.json;

                console.log(`👤 User: ${user?.name || 'Unknown'}`);
                console.log(`💰 Coins: ${state?.coins || 0}`);
                console.log(`🍎 Apples: ${state?.apples || 0}`);

                return { coins: state?.coins || 0, apples: state?.apples || 0 };
            }
        } catch (error) {
            console.log(`❌ Failed to get balance: ${error.message}`);
        }

        return { coins: 0, apples: 0 };
    }

    // MAIN TEST
    async function main() {
        console.log('🍎 === AppleVille Buy Test ===');

        // Check balance first
        const balance = await getBalance();

        console.log('\n📋 Available items to test:');
        console.log('SEEDS:');
        console.log('  - wheat (2 coins)');
        console.log('  - lettuce (8 coins)');
        console.log('  - carrot (25 coins)');
        console.log('  - tomato (80 coins)');
        console.log('  - onion (200 coins)');
        console.log('  - strawberry (600 coins)');
        console.log('  - pumpkin (1500 coins)');
        console.log('  - golden-apple (10 apples)');
        console.log('  - crystal-apple (40 apples)');
        console.log('  - diamond-apple (150 apples)');
        console.log('  - royal-apple (500 apples)');
        console.log('\nBOOSTERS:');
        console.log('  - fertiliser (18 coins)');
        console.log('  - silver-tonic (15 coins)');
        console.log('  - super-fertiliser (25 apples)');
        console.log('  - golden-tonic (50 apples)');
        console.log('  - deadly-mix (150 apples)');
        console.log('  - quantum-fertilizer (175 apples)');

        console.log('\n🧪 Running test purchases...');

        // Test 1: Buy cheap seed (wheat)
        if (balance.coins >= 2) {
            await testBuy('wheat', 1, 'SEED');
        } else {
            console.log('⏭️  Skipping wheat test - insufficient coins');
        }

        // Test 2: Buy cheap booster (fertiliser) 
        if (balance.coins >= 18) {
            await testBuy('fertiliser', 1, 'MODIFIER');
        } else {
            console.log('⏭️  Skipping fertiliser test - insufficient coins');
        }

        // Test 3: Buy apple-based item if have apples
        if (balance.apples >= 10) {
            await testBuy('golden-apple', 1, 'SEED');
        } else {
            console.log('⏭️  Skipping golden-apple test - insufficient apples');
        }

        console.log('\n✅ Test completed!');
    }

    // RUN THE TEST
    main().catch(error => {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    });

})();