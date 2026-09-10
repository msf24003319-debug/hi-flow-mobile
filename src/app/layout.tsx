import React from 'react';
import './globals.css';

export const metadata = {
  title: 'Hi Flow — Admin Panel',
  description: 'Hi Flow Pump Industries operations: approvals, products, orders, inquiries.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-white min-h-screen antialiased">{children}</body>
    </html>
  );
}
