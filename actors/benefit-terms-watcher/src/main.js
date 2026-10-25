// Benefit Terms Watcher: fetch public benefit/terms pages and report what each one says today
// about the credits and limits we expect, flagging anything that changed or disappeared.
import { CheerioCrawler } from '@crawlee/cheerio';
import { Actor, log } from 'apify';
import { check, htmlToText, sentences } from './extract.js';

await Actor.init();

const { pages = [], useProxy = true, maxRetries = 2 } = (await Actor.getInput()) ?? {};
if (!pages.length) log.warning('No pages in input; nothing to watch.');

const proxyConfiguration = useProxy && Actor.isAtHome() ? await Actor.createProxyConfiguration() : undefined;
const now = () => new Date().toISOString();
const failed = (page, error) => Actor.pushData({ planId: page.planId, url: page.url, fetchedAt: now(), ok: false, title: '', findings: [], error });

const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxRequestRetries: maxRetries,
    requestHandlerTimeoutSecs: 60,
    additionalMimeTypes: ['application/pdf'],
    async requestHandler({ request, $, body, contentType }) {
        const page = request.userData.page;
        if (contentType?.type?.includes('pdf')) { await failed(page, 'Page is a PDF; this watcher reads HTML pages only.'); return; }
        const html = typeof body === 'string' ? body : body.toString('utf8');
        const sents = sentences(htmlToText(html));
        const findings = (page.expect ?? []).map((e) => check(sents, e));
        log.info(`${page.planId}: ${findings.filter((f) => f.status !== 'same').length}/${findings.length} flagged`, { url: request.url });
        await Actor.pushData({ planId: page.planId, url: page.url, fetchedAt: now(), ok: true, title: $('title').first().text().trim(), findings });
    },
    // Blocked (403/429), timed out or unreachable after retries: still report the page so nothing silently drops.
    async failedRequestHandler({ request }, error) {
        await failed(request.userData.page, String(error?.message ?? error).slice(0, 300));
    },
});

await crawler.run(pages.filter((p) => p?.url).map((page) => ({ url: page.url, uniqueKey: `${page.planId}|${page.url}`, userData: { page } })));

await Actor.exit();
