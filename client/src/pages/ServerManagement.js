import React, { useState } from 'react';
import { Icon } from '../components/UI';
import ContactRequests from './ContactRequests';
import ServerDeals from './ServerDeals';
import SubscribedClients from './SubscribedClients';
import ServerPayments from './ServerPayments';

const TAB_STYLE = (active) => ({
  padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none',
  borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
  color: active ? 'var(--primary)' : 'var(--text3)',
  display: 'flex', alignItems: 'center', gap: 6,
});

export default function ServerManagement({ profiles = [] }) {
  const [tab, setTab] = useState('deals');

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border2)', marginBottom: 18 }}>
        <button style={TAB_STYLE(tab === 'deals')} onClick={() => setTab('deals')}>
          <Icon name="server" size={14} />Deals
        </button>
        <button style={TAB_STYLE(tab === 'clients')} onClick={() => setTab('clients')}>
          <Icon name="users" size={14} />Subscribed Clients
        </button>
        <button style={TAB_STYLE(tab === 'payments')} onClick={() => setTab('payments')}>
          <Icon name="money" size={14} />Payments
        </button>
        <button style={TAB_STYLE(tab === 'contact')} onClick={() => setTab('contact')}>
          <Icon name="comment" size={14} />Contact Requests
        </button>
      </div>

      {tab === 'deals'    && <ServerDeals />}
      {tab === 'clients'  && <SubscribedClients profiles={profiles} />}
      {tab === 'payments' && <ServerPayments profiles={profiles} />}
      {tab === 'contact'  && <ContactRequests />}
    </div>
  );
}
