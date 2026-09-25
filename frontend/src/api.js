const API = '/api';

async function request(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || data.message || `Request failed with status ${res.status}`);
    }
    return data;
}

export const getConfig = () => request(`${API}/config`);
export const saveConfig = (data) => request(`${API}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
});
export const getAccount = () => request(`${API}/account`);
export const getTopics = () => request(`${API}/topics`);
export const getGames = () => request(`${API}/games`);
export const goLive = (data) => request(`${API}/go-live`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
});
export const endLive = () => request(`${API}/end-live`, { method: 'POST' });
export const pauseLive = () => request(`${API}/pause`, { method: 'POST' });
export const resumeLive = () => request(`${API}/resume`, { method: 'POST' });
export const getStatus = () => request(`${API}/status`);
export const getStats = () => request(`${API}/stats`);
export const getAudience = () => request(`${API}/audience`);
export const getViolations = () => request(`${API}/violations`);
export const getQuota = () => request(`${API}/quota`);
export const uploadCookies = (fileOrContent) => {
    if (typeof fileOrContent === 'string') {
        return request(`${API}/login/cookies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cookies: fileOrContent })
        });
    }
    const fd = new FormData();
    fd.append('file', fileOrContent);
    return request(`${API}/login/cookies`, { method: 'POST', body: fd });
};

export const api = {
    getConfig,
    saveConfig,
    getAccount,
    getTopics,
    getGames,
    goLive,
    endLive,
    pauseLive,
    resumeLive,
    getStatus,
    getStats,
    getAudience,
    getViolations,
    getQuota,
    uploadCookies,
    get: async (endpoint) => {
        const res = await fetch(`${API}${endpoint}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    },
    post: async (endpoint, data) => {
        const res = await fetch(`${API}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: data ? JSON.stringify(data) : undefined
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Request failed');
        return json;
    }
};