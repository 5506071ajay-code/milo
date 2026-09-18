import asyncio, subprocess
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); c = await b.new_context(viewport={'width':390,'height':844})
        await c.add_init_script("window.__MILO_NATIVE__ = true;")
        pg = await c.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto('http://localhost:9001/'); await pg.wait_for_timeout(1200); t=await pg.inner_text('body')
        print('NATIVE first run asks for server:', 'MILO server' in t and 'Not set' in t and 'Set the server address' in t)
        await pg.fill('input[aria-label="MILO server URL"]','http://localhost:9999'); await pg.click('button:has-text("Use")'); await pg.wait_for_timeout(1500); t=await pg.inner_text('body'); print('BAD server rejected:', 'No MILO server answered' in t)
        await pg.fill('input[aria-label="MILO server URL"]','http://localhost:8787'); await pg.click('button:has-text("Use")'); await pg.wait_for_timeout(1500); t=await pg.inner_text('body'); print('GOOD server accepted:', 'Connected' in t, '| google honest:', 'not configured' in t, '| dev sign-in offered:', 'Developer sign-in' in t)
        await pg.fill('input[type=email]','meera@rvce.edu.in'); await pg.fill('input[placeholder="Your name"]','Meera'); await pg.click('button:has-text("Sign in as developer")'); await pg.wait_for_timeout(1800); t=await pg.inner_text('body')
        print('NATIVE dev login (bearer) → welcome:', 'Welcome, Meera' in t, '| token stored:', await pg.evaluate("!!localStorage.getItem('milo:token')"))
        await pg.click('a:has-text("Connect an account")'); await pg.wait_for_timeout(800); await pg.click('button:has-text("Connect") >> nth=0'); await pg.wait_for_timeout(300); await pg.check('.modal input[type=checkbox]'); await pg.click('.modal button:has-text("Approve and connect")'); await pg.wait_for_timeout(3000); t=await pg.inner_text('body'); print('NATIVE demo connect via CORS+bearer:', 'DEMO' in t and 'Last synced' in t)
        await pg.reload(); await pg.wait_for_timeout(1800); await pg.evaluate("location.hash='#/home'"); await pg.wait_for_timeout(600); t=await pg.inner_text('body'); print('NATIVE session survives restart:', 'Demo data.' in t)
        await pg.screenshot(path='/home/claude/native_home.png')
        await pg.evaluate("fetch('http://localhost:8787/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+localStorage.getItem('milo:token')}})"); await pg.wait_for_timeout(300); await pg.evaluate("localStorage.removeItem('milo:token')"); await pg.reload(); await pg.wait_for_timeout(1500); t=await pg.inner_text('body'); print('NATIVE logged out → sign-in:', 'Developer sign-in' in t)
        code = subprocess.check_output(['node','-e',"const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/tmp/e2e2.sqlite');const u=d.prepare(\"select id from users where email='meera@rvce.edu.in'\").get();const c='testcode'+Date.now();d.prepare('insert into login_codes (code,user_id,created_at) values (?,?,?)').run(c,u.id,new Date().toISOString());console.log(c)"],stderr=subprocess.DEVNULL).decode().strip()
        await pg.evaluate(f"window.__miloDeepLink('com.milo.app://auth?code={code}&created=0')"); await pg.wait_for_timeout(2500); t=await pg.inner_text('body'); print('DEEP LINK code exchange → signed in:', 'Demo data.' in t or 'Good ' in t, '| route', pg.url.split('#')[-1])
        r = await pg.evaluate(f"fetch('http://localhost:8787/auth/exchange',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{code:'{code}'}})}}).then(r=>r.status)"); print('Code is single-use → second exchange rejected:', r)
        print('ERRORS:', [e for e in errs if not any(x in e for x in ['401','400','ERR_CONNECTION','404'])][:5])
        await b.close()
asyncio.run(main())
