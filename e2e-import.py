import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1280,'height':900}); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8787/'); await pg.wait_for_timeout(1000)
        await pg.fill('input[type=email]','solo@gmail.com'); await pg.fill('input[placeholder="Your name"]','Solo User'); await pg.click('button:has-text("Sign in as developer")'); await pg.wait_for_timeout(1500)
        await pg.click('a:has-text("Connect an account")'); await pg.wait_for_timeout(800); t=await pg.inner_text('body'); print('Statement card available:', 'Import a bank statement' in t and 'no registration' in t)
        await pg.click('button:has-text("Import") >> nth=0'); await pg.wait_for_timeout(600); print('Import screen:', 'Import a bank statement' in (await pg.inner_text('h1')))
        await pg.set_input_files('input[aria-label="Statement file"]','/tmp/hdfc.csv'); await pg.wait_for_timeout(500); t=await pg.inner_text('body'); print('Preview parsed 3 rows:', 'Transactions found\n3' in t)
        await pg.click('button:has-text("Import")'); await pg.wait_for_timeout(300); print('Validation (bank missing):', 'Which bank' in (await pg.inner_text('body')))
        await pg.fill('input[placeholder="e.g. HDFC Bank"]','HDFC Bank'); await pg.fill('input[placeholder="4821"]','4821'); await pg.check('input[type=checkbox]'); await pg.click('button:has-text("Import")'); await pg.wait_for_timeout(2500); t=await pg.inner_text('body')
        print('Imported → connection listed with balance 49,080:', 'Connected' in t and '₹49,080' in t and '••4821' in t)
        await pg.evaluate("location.hash='#/journal'"); await pg.wait_for_timeout(700); t=await pg.inner_text('body'); print('Journal shows real rows:', 'SWIGGY' in t.upper() and '₹12,000' in t)
        await pg.evaluate("location.hash='#/home'"); await pg.wait_for_timeout(700); t=await pg.inner_text('body'); print('Home has numbers, no demo banner:', 'Demo data.' not in t and '₹49,080' in t)
        await pg.evaluate("location.hash='#/accounts'"); await pg.wait_for_timeout(700); await pg.click('a:has-text("Add statement")'); await pg.wait_for_timeout(600)
        await pg.set_input_files('input[aria-label="Statement file"]','/tmp/hdfc.csv'); await pg.wait_for_timeout(400); await pg.check('input[type=checkbox]'); await pg.click('button:has-text("Add transactions")'); await pg.wait_for_timeout(2000); print('Re-import dedupes (0 new):', '0 new transactions' in (await pg.inner_text('body')))
        await pg.evaluate("location.hash='#/accounts'"); await pg.wait_for_timeout(500); await pg.click('a:has-text("Add statement")'); await pg.wait_for_timeout(600); await pg.set_input_files('input[aria-label="Statement file"]','/tmp/sbi.csv'); await pg.wait_for_timeout(400); await pg.check('input[type=checkbox]'); await pg.click('button:has-text("Add transactions")'); await pg.wait_for_timeout(2000); print('Second file appends 2 new:', '2 new transactions' in (await pg.inner_text('body')))
        await pg.evaluate("location.hash='#/cfo'"); await pg.wait_for_timeout(500); await pg.fill('input[aria-label="Ask the AI CFO"]','How much did I spend this month?'); await pg.press('input[aria-label="Ask the AI CFO"]','Enter'); await pg.wait_for_timeout(1000); t=await pg.inner_text('body'); print('CFO answers from imported data:', 'You have spent' in t)
        print('ERRORS:', errs)
        await b.close()
asyncio.run(main())
