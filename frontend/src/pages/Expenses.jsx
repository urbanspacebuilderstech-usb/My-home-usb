import { useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from '@/components/Sidebar';
import { Card } from '@/components/ui/card';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Expenses() {
  const [user, setUser] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, expRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/expenses`)
      ]);
      setUser(userRes.data);
      setExpenses(expRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  if (!user) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
      <div className="flex-1 md:ml-64 p-4 md:p-8">
        <h1 data-testid="expenses-title" className="text-3xl font-bold mb-8">Expenses</h1>

        <Card className="p-6 mb-8">
          <h2 className="text-lg font-semibold mb-2">Total Expenses</h2>
          <p data-testid="total-expenses" className="text-4xl font-bold text-primary">₹{totalExpenses.toLocaleString()}</p>
        </Card>

        <div className="space-y-4">
          {expenses.map((exp) => (
            <Card key={exp.expense_id} data-testid={`expense-${exp.expense_id}`} className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold">{exp.category}</h3>
                  <p className="text-sm text-muted-foreground">{exp.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(exp.created_at).toLocaleDateString()}</p>
                </div>
                <p className="text-2xl font-bold">₹{exp.amount.toLocaleString()}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}