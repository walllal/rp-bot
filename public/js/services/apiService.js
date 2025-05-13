// Helper function to get Authorization header
const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// Helper function to handle unauthorized responses
const handleUnauthorized = (response) => {
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('authToken');
        // Prevent redirect loops if already on login page
        if (window.location.pathname !== '/login') {
            console.warn('Unauthorized access or token expired, redirecting to login.');
            window.location.href = '/login'; // Ensure this path is correct
        }
        // Return a rejected promise to stop further processing in the original promise chain
        return Promise.reject(new Error(response.statusText || `Unauthorized (${response.status})`));
    }
    return response; // Pass through if not 401/403
};

// Wrapper for fetch to automatically add auth token and handle 401/403
const fetchWithAuth = async (url, options = {}) => {
    const defaultHeaders = getAuthHeaders();
    const mergedOptions = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...(options.headers || {}),
        },
    };

    // Automatically set Content-Type and stringify body if it's an object for POST/PUT/DELETE
    if ((mergedOptions.method === 'POST' || mergedOptions.method === 'PUT' || mergedOptions.method === 'DELETE') &&
        mergedOptions.body && typeof mergedOptions.body === 'object' &&
        !(mergedOptions.body instanceof FormData)) {
        
        if (!mergedOptions.headers['Content-Type']) {
            mergedOptions.headers['Content-Type'] = 'application/json';
        }
        // Only stringify if Content-Type is application/json
        if (mergedOptions.headers['Content-Type'] === 'application/json' && typeof mergedOptions.body !== 'string') {
            mergedOptions.body = JSON.stringify(mergedOptions.body);
        }
    }

    return fetch(url, mergedOptions)
        .then(handleUnauthorized) // First, handle potential 401/403 errors
        .then(res => {            // Then, process the response
            if (!res.ok) {
                // Attempt to parse error details from JSON response
                return res.json()
                    .then(errorData => {
                        const message = errorData.message || errorData.error || res.statusText || `HTTP error ${res.status}`;
                        const error = new Error(message);
                        // @ts-ignore
                        error.status = res.status;
                        // @ts-ignore
                        error.details = errorData.details || errorData.errors;
                        return Promise.reject(error);
                    })
                    .catch(() => {
                        // If response is not JSON or JSON parsing fails
                        const error = new Error(res.statusText || `HTTP error ${res.status}`);
                        // @ts-ignore
                        error.status = res.status;
                        return Promise.reject(error);
                    });
            }
            // Handle 204 No Content specifically, as res.json() would fail
            if (res.status === 204) {
                return Promise.resolve(true); // Or undefined, or an empty object, depending on needs
            }
            return res.json(); // For successful responses with JSON body
        });
};

// --- API 调用封装 ---
const api = {
    getAuthStatus: () => fetchWithAuth('/api/auth/status'), // Does not need auth, but using fetchWithAuth is fine
    getPresets: () => fetchWithAuth('/api/presets'),
    createPreset: (data) => fetchWithAuth('/api/presets', { method: 'POST', body: data }),
    getPreset: (id) => fetchWithAuth(`/api/presets/${id}`),
    updatePreset: (id, data) => fetchWithAuth(`/api/presets/${id}`, { method: 'PUT', body: data }),
    deletePreset: (id) => fetchWithAuth(`/api/presets/${id}`, { method: 'DELETE' }),
    getAssignments: () => fetchWithAuth('/api/assignments'),
    updateAssignment: (data) => fetchWithAuth('/api/assignments', { method: 'PUT', body: data }),
    deleteAssignment: (data) => fetchWithAuth('/api/assignments', { method: 'DELETE', body: data }),
    getHistory: (type, id, limit) => fetchWithAuth(`/api/history/${type}/${id}?limit=${limit}`),
    deleteHistory: (type, id, count) => fetchWithAuth(`/api/history/${type}/${id}`, { method: 'DELETE', body: { count } }),
    getSettings: () => fetchWithAuth('/api/settings'),
    updateSettings: (data) => fetchWithAuth('/api/settings', { method: 'PUT', body: data }),
    getAccessControlList: (type) => fetchWithAuth(`/api/access-control?type=${type}`),
    addAccessControlEntry: (data) => fetchWithAuth('/api/access-control', { method: 'POST', body: data }),
    removeAccessControlEntry: (data) => fetchWithAuth('/api/access-control', { method: 'DELETE', body: data }),
    importPresets: (data) => fetchWithAuth('/api/presets/import', { method: 'POST', body: data }),
    getMessageHistory: (type, id, limit) => fetchWithAuth(`/api/message-history/${type}/${id}?limit=${limit}`),
    deleteMessageHistory: (type, id, count) => fetchWithAuth(`/api/message-history/${type}/${id}`, { method: 'DELETE', body: { count } }),
    getPlugins: () => fetchWithAuth('/api/plugins'),
    getPluginConfig: (name) => fetchWithAuth(`/api/plugins/${name}/config`),
    getPluginConfigDefinition: (name) => fetchWithAuth(`/api/plugins/${name}/config/definition`),
    updatePluginConfig: (name, config) => fetchWithAuth(`/api/plugins/${name}/config`, { method: 'PUT', body: { config } }),
    enablePlugin: (name) => fetchWithAuth(`/api/plugins/${name}/enable`, { method: 'POST' }),
    disablePlugin: (name) => fetchWithAuth(`/api/plugins/${name}/disable`, { method: 'POST' }),
    getQQVoiceSpeakers: (groupId) => {
        const url = groupId
            ? `/api/plugins/qq-voice/speakers?groupId=${encodeURIComponent(groupId)}`
            : '/api/plugins/qq-voice/speakers';
        return fetchWithAuth(url);
    },
    getFriends: () => fetchWithAuth('/api/contacts/friends'),
    getGroups: () => fetchWithAuth('/api/contacts/groups'),
    getDisguisePresets: () => fetchWithAuth('/api/disguise/presets'),
    createDisguisePreset: (data) => fetchWithAuth('/api/disguise/presets', { method: 'POST', body: data }),
    getDisguisePreset: (id) => fetchWithAuth(`/api/disguise/presets/${id}`),
    updateDisguisePreset: (id, data) => fetchWithAuth(`/api/disguise/presets/${id}`, { method: 'PUT', body: data }),
    deleteDisguisePreset: (id) => fetchWithAuth(`/api/disguise/presets/${id}`, { method: 'DELETE' }),
    getDisguiseAssignments: () => fetchWithAuth('/api/disguise/assignments'),
    upsertDisguiseAssignment: (data) => fetchWithAuth('/api/disguise/assignments', { method: 'PUT', body: data }),
    deleteDisguiseAssignment: (data) => fetchWithAuth('/api/disguise/assignments', { method: 'DELETE', body: data }),
    importDisguisePresets: (data) => fetchWithAuth('/api/disguise/presets/import', { method: 'POST', body: data }),
    listGlobalVariables: (searchTerm) => {
        const url = searchTerm ? `/api/variables/global?search=${encodeURIComponent(searchTerm)}` : '/api/variables/global';
        return fetchWithAuth(url);
    },
    createGlobalVariable: (data) => fetchWithAuth('/api/variables/global', { method: 'POST', body: data }),
    updateGlobalVariable: (name, data) => fetchWithAuth(`/api/variables/global/${encodeURIComponent(name)}`, { method: 'PUT', body: data }),
    deleteGlobalVariable: (name) => fetchWithAuth(`/api/variables/global/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    createLocalVariableDefinition: (data) => fetchWithAuth('/api/variables/local-definitions', { method: 'POST', body: data }),
    listLocalVariableDefinitions: (filters) => {
        const queryParams = new URLSearchParams();
        if (filters?.name) queryParams.append('name', filters.name);
        const queryString = queryParams.toString();
        return fetchWithAuth(`/api/variables/local-definitions${queryString ? '?' + queryString : ''}`);
    },
    getLocalVariableDefinitionById: (id) => fetchWithAuth(`/api/variables/local-definitions/${id}`),
    updateLocalVariableDefinition: (id, data) => fetchWithAuth(`/api/variables/local-definitions/${id}`, { method: 'PUT', body: data }),
    deleteLocalVariableDefinition: (id) => fetchWithAuth(`/api/variables/local-definitions/${id}`, { method: 'DELETE' }),
    listLocalVariableInstances: (filters) => {
        const queryParams = new URLSearchParams();
        if (filters?.definitionName) queryParams.append('definitionName', filters.definitionName);
        if (filters?.contextType) queryParams.append('contextType', filters.contextType);
        if (filters?.contextId) queryParams.append('contextId', filters.contextId);
        if (filters?.userId) queryParams.append('userId', filters.userId);
        if (filters?.value) queryParams.append('value', filters.value);
        const queryString = queryParams.toString();
        return fetchWithAuth(`/api/variables/local-instances${queryString ? '?' + queryString : ''}`);
    },
    deleteLocalVariableInstance: (instanceId) => fetchWithAuth(`/api/variables/local-instances/${instanceId}`, { method: 'DELETE' }),
    updateLocalVariableInstance: (instanceId, data) => fetchWithAuth(`/api/variables/local-instances/${instanceId}`, { method: 'PUT', body: data }),
};

export default api;