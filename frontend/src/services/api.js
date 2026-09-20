const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error(`[API] Error on ${endpoint}:`, err.message);
    throw err;
  }
}

export async function getFLStatus() {
  return request('/fl/status');
}

export async function getClients(filters = {}) {
  const query = new URLSearchParams(filters).toString();
  return request(`/fl/clients${query ? `?${query}` : ''}`);
}

export async function getJobs(filters = {}) {
  const query = new URLSearchParams(filters).toString();
  return request(`/jobs${query ? `?${query}` : ''}`);
}

export async function getJobDetails(id) {
  return request(`/jobs/${id}`);
}

export async function getWorkflows() {
  return request('/workflows');
}

export async function getWorkflowDetails(id) {
  return request(`/workflows/${id}`);
}

export async function getRecentActivity() {
  return request('/fl/activity');
}

export async function simulateClientFailure(clientId = null) {
  return request('/fl/simulate-failure', {
    method: 'POST',
    body: JSON.stringify({ client_id: clientId }),
  });
}

export async function createTrainingJob(clientId, flRound = 1) {
  return request('/fl/jobs/training', {
    method: 'POST',
    body: JSON.stringify({ client_id: clientId, fl_round: flRound }),
  });
}
