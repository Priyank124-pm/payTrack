"use client";

import { useState } from "react";
import Image from "next/image";

// ── Small inline icon set (keeps this page dependency-free) ──────
const ICONS = {
  shield:
    "M12 2 4 5v6c0 5.2 3.4 9.8 8 11 4.6-1.2 8-5.8 8-11V5l-8-3zm0 2.2 6 2.25V11c0 4.2-2.6 8-6 9-3.4-1-6-4.8-6-9V6.45l6-2.25z",
  clock:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13h-1.5v6l5.2 3.1.8-1.3-4.5-2.7V7z",
  headset:
    "M12 3a8 8 0 0 0-8 8v5a3 3 0 0 0 3 3h1v-7H5v-1a7 7 0 0 1 14 0v1h-3v7h1a3 3 0 0 0 3-3v-5a8 8 0 0 0-8-8z",
  growth: "M4 20h16v2H4v-2zm2-3 4-5 3 3 6-7 1.4 1.4-7.4 8.6-3-3-3 3.5L4 17z",
  monitor:
    "M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-6v2h3v2H7v-2h3v-2H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 2v9h16V6H4z",
  security:
    "M12 2 4 5v6c0 5.2 3.4 9.8 8 11 4.6-1.2 8-5.8 8-11V5l-8-3zm-1.2 12.6L7.6 11.4l1.4-1.4 1.8 1.8 4.2-4.2 1.4 1.4-5.6 5.6z",
  backup:
    "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zm-8 5.5c0 1.7 3.6 3 8 3s8-1.3 8-3V11c0 1.7-3.6 3-8 3s-8-1.3-8-3V8.5zm0 5.5c0 1.7 3.6 3 8 3s8-1.3 8-3v2.5c0 1.7-3.6 3-8 3s-8-1.3-8-3V14z",
  wrench:
    "M22 19.3 15.3 12.6a5.5 5.5 0 0 0-7-7L11.6 8l-2 2-3.4-3.3a5.5 5.5 0 0 0 7 7L20 20.7 22 19.3z",
  lock: "M12 2a4 4 0 0 0-4 4v3H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4zm-2 7V6a2 2 0 1 1 4 0v3h-4z",
  check: "M9 16.2 4.8 12l-1.4 1.4L9 19 20.6 7.4 19.2 6z",
  person:
    "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z",
  bolt: "M13 2 3 14h7l-1 8 11-14h-7l0-6z",
  code: "M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6z",
};
const Icon = ({ name, size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d={ICONS[name] || ICONS.check} />
  </svg>
);


const FAQS = [
  {
    q: "Is this the same as buying a server from a hosting provider?",
    a: "No. With StackReady, you get a managed hosting environment along with a team that handles server setup, configuration, monitoring, security updates, backups, and maintenance. You can focus on your business while we take care of the infrastructure.",
  },
  {
    q: "Do I need technical knowledge to use StackReady?",
    a: "No advanced server management knowledge is required. Our team manages the hosting infrastructure, so you don’t need to handle routine server administration yourself.",
  },
  {
    q: "Does StackReady include application development?",
    a: "No. Managed hosting and application development are separate services. Your development team handles application code, new features, and application-level changes. If a hosting or application issue occurs, we can help identify the responsible area and coordinate with your development team.",
  },
  {
    q: "What happens if my application has a problem?",
    a: "Simply contact our support team. We’ll investigate whether the issue is related to the server, hosting configuration, or application. If development work is required, we’ll help coordinate with your development team.",
  },
  {
    q: "Is SSL included in the hosting plans?",
    a: "Yes. SSL certificates are included in our managed hosting plans to help secure your website and protect data transmitted between users and your application.",
  },
  {
    q: "Are backups included in the hosting plans?",
    a: "Yes. Daily backups are included in our hosting plans. Backup configuration and retention depend on your selected plan and requirements.",
  },
  {
    q: "Can I upgrade my server as my business grows?",
    a: "Yes. We can help you scale your hosting infrastructure as your application grows. Contact our team to discuss your resource requirements and available upgrade options.",
  },
  {
    q: "Can I continue using my existing development team?",
    a: "Yes. You can continue working with your existing developers. StackReady manages the hosting infrastructure while your development team continues handling application development and code changes.",
  },
  {
    q: "What is the difference between self-managed and managed hosting?",
    a: "With self-managed hosting, you or your IT team are responsible for server setup, monitoring, updates, security, and maintenance. With StackReady managed hosting, our team handles these infrastructure responsibilities, giving you more time to focus on your business.",
  },
  {
    q: "Are third-party services included in the hosting plans?",
    a: "Third-party services such as cloud providers, external APIs, and other paid infrastructure services may have separate charges. We’ll clarify any additional costs based on your hosting requirements before setup.",
  },
  {
    q: "How do I get started with StackReady?",
    a: "Choose a hosting plan that fits your needs and contact our team. We’ll discuss your application, hosting requirements, and setup process, then help get your managed hosting environment ready.",
  },
];

function Header({ onGetStarted }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="wrap">
        <a href="#top" className="logo">
          <Image
            src="/logo.svg"
            alt=""
            width={900}
            height={350}
            className="logo-mark-img"
          />
        </a>
        <nav className="main-nav">
          <a href="#top">Home</a>
          <a href="#features">Features</a>
          <a href="#hosting">Hosting Plans</a>
          <a href="#faq">FAQ</a>
          <a href="#contact">Contact</a>
        </nav>
        <div className="header-actions">
          {/* <a href="/admin" className="btn btn-outline">Client Login</a> */}
          <button className="btn btn-primary" onClick={onGetStarted}>
            Get Started →
          </button>
          <button
            className="nav-toggle"
            aria-label="Menu"
            onClick={() => setOpen((o) => !o)}
          >
            ☰
          </button>
        </div>
      </div>
      {open && (
        <div
          className="wrap"
          style={{
            paddingBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <a href="#top" onClick={() => setOpen(false)}>
            Home
          </a>
          <a href="#features" onClick={() => setOpen(false)}>
            Features
          </a>
          <a href="#hosting" onClick={() => setOpen(false)}>
            Hosting Plans
          </a>
          <a href="#faq" onClick={() => setOpen(false)}>
            FAQ
          </a>
          <a href="#contact" onClick={() => setOpen(false)}>
            Contact
          </a>
          {/* <a href="/admin">Client Login</a> */}
        </div>
      )}
    </header>
  );
}

function Hero({ onGetStarted }) {
  return (
    <section className="hero" id="top">
      <div className="wrap hero-grid">
        <Image
          src="/hero_section_image.png"
          alt="Managed server racks with active status lights"
          className="hero-photo"
          width={1320}
          height={1191}
          priority
        />
        <div className="hero-copy">
          <div className="eyebrow">Managed Server Hosting</div>
          <h1>
            Your Application Deserves a<br />
            <span className="accent">Stronger Foundation</span>
          </h1>
          <p className="lede">
            Fully managed hosting for businesses that want reliability, security
            and peace of mind.
          </p>
          <p className="fine">
            We handle the server, monitoring, updates, backups and security so
            you can focus on your business.
          </p>
          <div className="hero-cta">
            <button className="btn btn-primary" onClick={onGetStarted}>
              Get Started →
            </button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-badge">
            <div className="item">
              <span className="ic">
                <Icon name="lock" size={22} />
              </span>
              <div>
                <b>SSL Included</b>
                <span>Encrypt your data and build trust.</span>
              </div>
            </div>
            <div className="item">
              <span className="ic">
                <Icon name="clock" size={22} />
              </span>
              <div>
                <b>99.9% Uptime</b>
                <span>Maximum performance for your business.</span>
              </div>
            </div>
            <div className="item">
              <span className="ic">
                <Icon name="headset" size={22} />
              </span>
              <div>
                <b>Expert Support</b>
                <span>Real people, quick help.</span>
              </div>
            </div>
            <div className="item">
              <span className="ic">
                <Icon name="growth" size={22} />
              </span>
              <div>
                <b>Focus on Growth</b>
                <span>We handle the rest.</span>
              </div>
            </div>
          </div>
          <div className="hero-caption">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 15c3-6 9-9 15-8" />
              <path d="M15 4l4 3-3 4" />
            </svg>
            <span>
              A safer, faster
              <br />
              website awaits.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: "shield",
    title: "Secure & Reliable",
    sub: "99.9% uptime with proactive monitoring",
  },
  {
    icon: "monitor",
    title: "24/7 Monitoring",
    sub: "We keep an eye on your server, always",
  },
  {
    icon: "security",
    title: "Security & Updates",
    sub: "Regular patches and security checks",
  },
  { icon: "backup", title: "Backups", sub: "Your data, safely backed up" },
  {
    icon: "wrench",
    title: "Maintenance",
    sub: "Routine server maintenance included",
  },
  {
    icon: "lock",
    title: "SSL Certificates",
    sub: "Free SSL included to keep your website secure",
  },
];

function FeatureStrip() {
  return (
    <section className="wrap" id="features">
      <div className="feature-strip">
        {FEATURES.map((f) => (
          <div className="feature-item" key={f.title}>
            <div className="feature-icon">
              <Icon name={f.icon} />
            </div>
            <b>{f.title}</b>
            <span>{f.sub}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const COMPARE_ROWS = [
  "Server setup",
  "Server configuration",
  "Security updates",
  "SSL certificates",
  "Server monitoring",
  "Backups",
  "Routine maintenance",
  "Deployment assistance",
];

function WhatIsManaged() {
  return (
    <section className="section" id="hosting">
      <div className="wrap split hosting-compare">
        <div className="hosting-left-st">
          <div className="eyebrow">What does managed hosting mean?</div>
          <h2 className="hosting-title">
            A server gives you a server. We give you a team behind it.
          </h2>
          <p className="hosting-p lede">
            With unmanaged hosting, you&rsquo;re responsible for everything.
            With StackReady, our team handles the infrastructure so you
            don&rsquo;t have to.
          </p>
          <div className="quote-box">
            <span className="quote-mark" aria-hidden="true">
              &ldquo;
            </span>
            <span>
              Less time dealing with servers.
              <br />
              More time running your business.
            </span>
          </div>
        </div>
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Self-Managed</th>
                <th>StackReady Managed Hosting</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row) => (
                <tr key={row}>
                  <td>{row}</td>
                  <td>You</td>
                  <td>
                    <span className="check-badge">
                      <Icon name="check" size={11} />
                    </span>
                    Our team
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const HOSTING_TASKS = [
  "Server health monitoring",
  "Infrastructure monitoring",
  "Security upgrades",
  "SSL certificate management",
  "Backups",
  "Server maintenance",
  "Server configuration",
  "Hosting-related technical support",
  "Deployment assistance",
];
const DEV_TASKS = [
  "Application development",
  "Code changes",
  "New features",
  "Application enhancements",
  "Major application bugs",
  "Third-party integrations",
  "Major application changes",
];

function TwoTeams() {
  return (
    <section className="section pt-0">
      <div className="wrap split split-teams">
        <div>
          <div className="eyebrow">Two teams. Clear responsibilities.</div>
          <h2 className="teams-title">
            Separate by design. Better together when you need it.
          </h2>
          <p className="teams-p lede">
            Your hosting and development services remain separate, so your
            subscription stays clear and predictable. If a technical issue
            requires application-level support, we&rsquo;ll help coordinate with
            your development team.
          </p>
          <div className="team-cards" style={{ marginTop: 24 }}>
            <div className="team-card">
              <div className="head">
                <span className="ic">
                  <Icon name="lock" size={16} />
                </span>
                We take care of your hosting:
              </div>
              <ul>
                {HOSTING_TASKS.map((t) => (
                  <li key={t}>
                    <span className="check-badge">
                      <Icon name="check" size={10} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="team-card">
              <div className="head">
                <span className="ic">
                  <Icon name="code" size={16} />
                </span>
                Your development team takes care of:
              </div>
              <ul>
                {DEV_TASKS.map((t) => (
                  <li key={t}>
                    <span className="check-badge">
                      <Icon name="check" size={10} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="side-box soft-bg">
          <b className="problem-heading">
            Not sure what&rsquo;s causing the problem?
          </b>
          <p className="problem-description">
            Just contact us. We&rsquo;ll help point you in the right direction.
          </p>
          <div className="row">
            <span className="ic">
              <Icon name="monitor" size={15} />
            </span>
            <div>
              <b>If it&rsquo;s a hosting issue</b>
              <span>We handle it.</span>
            </div>
          </div>
          <div className="row">
            <span className="ic">
              <Icon name="code" size={15} />
            </span>
            <div>
              <b>If it&rsquo;s application development</b>
              <span>We can coordinate with your development team.</span>
            </div>
          </div>
          <div className="row">
            <span className="ic">
              <Icon name="person" size={15} />
            </span>
            <div>
              <b>If additional development work is required</b>
              <span>We&rsquo;ll help you get to the right team.</span>
            </div>
          </div>
          <div className="tag-line">
            You don&rsquo;t have to figure it out alone.
          </div>
        </div>
      </div>
    </section>
  );
}

function WhyManaged() {
  return (
    <section className="section pt-0">
      <div className="wrap why-managed-grid">
        <div className="why-intro">
          <div className="eyebrow">Why managed hosting?</div>
          <h2 className="why-title">
            Because &ldquo;it&rsquo;s a server problem&rdquo; shouldn&rsquo;t
            become your problem.
          </h2>
          <p className="why-description">
            When you manage infrastructure yourself, even a small issue can turn
            into a chain of technical conversations. With StackReady, you have
            one point of contact and a team that helps you get to the right
            solution.
          </p>
        </div>
        <div className="compare-card without-card">
          <h3>Without Managed Hosting</h3>
          <ul className="comparison-list problem-list">
            <li>
              <span className="row-icon">
                <Icon name="person" size={14} />
              </span>
              <span>Something stops working</span>
            </li>
            <li>
              <span className="row-icon">
                <Icon name="person" size={14} />
              </span>
              <span>Is it the server?</span>
            </li>
            <li>
              <span className="row-icon">
                <Icon name="person" size={14} />
              </span>
              <span>Is it the application?</span>
            </li>
            <li>
              <span className="row-icon">
                <Icon name="person" size={14} />
              </span>
              <span>Who do I contact?</span>
            </li>
            <li>
              <span className="row-icon">
                <Icon name="person" size={14} />
              </span>
              <span>More downtime, more stress.</span>
            </li>
          </ul>
          <div className="result-box warning-box">
            <span className="result-icon">
              <Icon name="bolt" size={18} />
            </span>
            <div>
              <strong>Time wasted.</strong>
              <strong>Unnecessary stress.</strong>
            </div>
          </div>
        </div>
        <div className="compare-card with-card">
          <h3>With StackReady</h3>
          <ul className="comparison-list success-list">
            <li>
              <span className="row-icon">
                <Icon name="check" size={12} />
              </span>
              <span>Something stops working</span>
            </li>
            <li>
              <span className="row-icon">
                <Icon name="check" size={12} />
              </span>
              <span>Contact us</span>
            </li>
            <li>
              <span className="row-icon">
                <Icon name="check" size={12} />
              </span>
              <span>We investigate and help identify the issue.</span>
            </li>
          </ul>
          <div className="result-box success-box">
            <span className="result-icon">
              <Icon name="check" size={20} />
            </span>
            <div>
              <strong>Faster resolution.</strong>
              <strong>Peace of mind.</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const [openIdx, setOpenIdx] = useState(null);
  return (
    <section className="section" id="faq">
      <div className="wrap">
        <div className="pricing-head">
          <div>
            <div className="eyebrow">Frequently Asked Questions</div>
            <h2>Got Questions? We&rsquo;ve Got Answers.</h2>
          </div>
        </div>
        <div className="faq-grid">
          {FAQS.map((f, i) => (
            <div className="faq-item" data-open={openIdx === i} key={f.q}>
              <button
                className="faq-q"
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                aria-expanded={openIdx === i}
              >
                {f.q}
                <span className="faq-plus">+</span>
              </button>
              <div className="faq-a">{f.a}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTABanner({ onContact }) {
  return (
    <section className="cta-banner" id="contact">
      <div className="wrap cta-grid">
        <div>
          <h2>Your Application Is Already Running.</h2>
          <p className="lede">
            Don&rsquo;t let server management become another job. Let StackReady
            take care of the infrastructure while you focus on your business.
          </p>
          <div className="hero-cta">
            <button className="btn btn-outline-invert" onClick={onContact}>
              Talk To Our Team
            </button>
          </div>
        </div>
        <div className="cta-side">
          <b>Reliable Hosting. Real People.</b>
          <p>
            Secure, scalable and managed by a team that cares about your
            success.
          </p>
        </div>
      </div>
    </section>
  );
}

function Footer({ onContact }) {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-top">
          <div className="footer-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG source; next/image's optimizer doesn't handle local SVGs without extra config, and there's nothing to optimize on a vector anyway */}
            <img
              src="/logo.png"
              alt="StackReady — Fast. Managed. Secure."
              className="footer-logo-img"
            />
          </div>
          <div className="footer-col">
            <b>Services</b>
            <ul>
              <li>Managed Hosting</li>
              <li>Server Management</li>
              <li>Security &amp; Monitoring</li>
              <li>Backup &amp; Disaster Recovery</li>
              <li>SSL Certificates</li>
            </ul>
          </div>
          {/* <div className="footer-col">
            <b>Company</b>
            <ul>
              <li>About Us</li>
              <li>Why StackReady</li>
              <li>Case Studies</li>
              <li>Blog</li>
              <li>
                <a href="#contact" onClick={onContact}>
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <b>Resources</b>
            <ul>
              <li>
                <a href="#faq">FAQs</a>
              </li>
              <li>Knowledge Base</li>
              <li>Support</li>
              <li>Terms of Service</li>
              <li>Privacy Policy</li>
            </ul>
          </div> */}
          <div className="footer-col footer-last-col">
            <b>Stay in the loop</b>
            <p style={{ fontSize: 13, opacity: 0.78, margin: 0 }}>
              Get the latest updates and tips on hosting, security, and more.
            </p>
            <div className="newsletter-row">
              <input
                type="email"
                placeholder="Your email address"
                suppressHydrationWarning
              />
              <button aria-label="Subscribe">→</button>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} StackReady. All rights reserved.
          </span>
          <span>
            <a href="#">Terms of Service</a>
            <a href="#">Privacy Policy</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

function ContactModal({ onClose }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          data.error ||
            data.errors?.[0]?.msg ||
            "Could not submit your request",
        );
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box">
        {done ? (
          <>
            <h3>Thanks — we&rsquo;ll be in touch!</h3>
            <p>Our team will reach out to {form.email} shortly.</p>
            <button className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <h3>Talk to our team</h3>
            <p>
              Tell us a bit about your project and we&rsquo;ll get back to you
              within one business day.
            </p>
            {error && (
              <div
                style={{
                  background: "var(--amber-bg)",
                  color: "var(--amber)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                  marginBottom: 14,
                }}
              >
                {error}
              </div>
            )}
            <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
              <input
                className="modal-input"
                required
                placeholder="Your name *"
                value={form.name}
                onChange={set("name")}
                style={inputStyle}
              />
              <input
                className="modal-input"
                required
                type="email"
                placeholder="Email address *"
                value={form.email}
                onChange={set("email")}
                style={inputStyle}
              />
              <input
                className="modal-input"
                placeholder="Company (optional)"
                value={form.company}
                onChange={set("company")}
                style={inputStyle}
              />
              <textarea
                className="modal-input"
                placeholder="What do you need help with?"
                rows={3}
                value={form.message}
                onChange={set("message")}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
const inputStyle = {
  border: "1.5px solid var(--border)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  width: "100%",
};

export default function Home() {
  const [contactOpen, setContactOpen] = useState(false);

  const openContact = (e) => {
    e?.preventDefault();
    setContactOpen(true);
  };

  return (
    <main>
      <Header onGetStarted={openContact} />
      <Hero onGetStarted={openContact} />
      <FeatureStrip />
      <WhatIsManaged />
      <TwoTeams />
      <WhyManaged />
      <FAQ />
      <CTABanner onGetStarted={openContact} onContact={openContact} />
      <Footer onContact={openContact} />

      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}
    </main>
  );
}
