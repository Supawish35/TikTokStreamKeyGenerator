import { useState, useEffect } from 'react';

export function useSSE(url = '/api/events', options = {}) {
    const [isConnected, setIsConnected] = useState(false);
    const [status, setStatus] = useState(null);
    const [stats, setStats] = useState(null);
    const [audience, setAudience] = useState(null);
    const [safety, setSafety] = useState(null);
    const [quota, setQuota] = useState(null);

    useEffect(() => {
        const es = new EventSource(url);
        es.onopen = () => setIsConnected(true);
        es.onerror = () => setIsConnected(false);
        es.addEventListener('status', (e) => { try { setStatus(JSON.parse(e.data)); } catch (_) {} });
        es.addEventListener('stats', (e) => { try { setStats(JSON.parse(e.data)); } catch (_) {} });
        es.addEventListener('audience', (e) => { try { setAudience(JSON.parse(e.data)); } catch (_) {} });
        es.addEventListener('safety', (e) => { try { setSafety(JSON.parse(e.data)); } catch (_) {} });
        es.addEventListener('quota', (e) => { try { setQuota(JSON.parse(e.data)); } catch (_) {} });
        es.addEventListener('heartbeat', () => setIsConnected(true));
        es.addEventListener('violation_alert', (e) => {
            try {
                const data = JSON.parse(e.data);
                if (options.onViolationAlert) options.onViolationAlert(data);
            } catch (_) {}
        });
        return () => es.close();
    }, [url, options.onViolationAlert]);

    return { isConnected, status, stats, audience, safety, quota };
}