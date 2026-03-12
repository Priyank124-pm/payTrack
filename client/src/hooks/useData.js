import { useState, useEffect, useCallback } from 'react';
import { projectsAPI, milestonesAPI, usersAPI, changeRequestsAPI } from '../api';

// ── Commission helpers ─────────────────────────────────────────
export const COMMISSION_PORTALS = ['Fiverr', 'Upwork'];
export const COMMISSION_RATE    = 0.20;
export const calcNet = (amount, portal) =>
  COMMISSION_PORTALS.includes(portal) ? amount * (1 - COMMISSION_RATE) : amount;
export const PORTALS = ['Upwork','Fiverr','Toptal','PeoplePerHour','Freelancer','Direct'];

// ── Generic fetch hook ─────────────────────────────────────────
function useFetch(fetchFn, deps = []) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchFn();
      setData(Array.isArray(result) ? result : []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, deps); // eslint-disable-line

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, refetch: load, setData };
}

// ── useProfiles ───────────────────────────────────────────────
export const useProfiles = () => {
  const { data: profiles, loading, refetch } = useFetch(() => usersAPI.list());

  const createProfile = async (form) => { await usersAPI.create(form);           await refetch(); };
  const updateProfile = async (id, u) => { await usersAPI.update(id, u);         await refetch(); };
  const deleteProfile = async (id)    => { await usersAPI.remove(id);            await refetch(); };

  return { profiles, loading, createProfile, updateProfile, deleteProfile, refetch };
};

// ── useProjects ────────────────────────────────────────────────
export const useProjects = () => {
  const { data: projects, loading, refetch } = useFetch(() => projectsAPI.list());

  const createProject  = async (form) => { const p = await projectsAPI.create(form);          await refetch(); return p; };
  const updateProject  = async (id, u) => { await projectsAPI.update(id, u);                  await refetch(); };
  const deleteProject  = async (id)    => { await projectsAPI.remove(id);                     await refetch(); };
  const markAllReceived= async (id)    => { await projectsAPI.markReceived(id);               await refetch(); };

  return { projects, loading, createProject, updateProject, deleteProject, markAllReceived, refetch };
};

// ── useMilestones ──────────────────────────────────────────────
export const useMilestones = () => {
  const { data: milestones, loading, refetch } = useFetch(() => milestonesAPI.list());

  const addMilestone    = async (form) => { const m = await milestonesAPI.create(form);  await refetch(); return m; };
  const updateMilestone = async (id, u) => { await milestonesAPI.update(id, u);          await refetch(); };
  const deleteMilestone = async (id)    => { await milestonesAPI.remove(id);             await refetch(); };

  const getForProject = (pid)  => milestones.filter(m => m.project_id === pid);
  const getAchieved   = (pid)  => milestones.filter(m => m.project_id === pid).reduce((s, m) => s + parseFloat(m.achieved || 0), 0);

  return { milestones, loading, addMilestone, updateMilestone, deleteMilestone, getForProject, getAchieved, refetch };
};

// ── useChangeRequests ──────────────────────────────────────────
export const useChangeRequests = () => {
  const { data: crs, loading, refetch } = useFetch(() => changeRequestsAPI.list());

  const addCR     = async (form) => { await changeRequestsAPI.create(form);    await refetch(); };
  const approveCR = async (id)   => { await changeRequestsAPI.approve(id);     await refetch(); };
  const rejectCR  = async (id)   => { await changeRequestsAPI.reject(id);      await refetch(); };

  return { crs, loading, addCR, approveCR, rejectCR, refetch };
};
