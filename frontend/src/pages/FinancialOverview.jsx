import { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, LogOut, Save, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning', color: 'bg-gray-200' },
  { value: 'documentation', label: 'Documentation', color: 'bg-red-200' },
  { value: 'sub_structure', label: 'Sub-Structure', color: 'bg-yellow-200' },
  { value: 'super_structure', label: 'Super-Structure', color: 'bg-blue-200' },
  { value: 'finishing', label: 'Finishing', color: 'bg-purple-200' },
  { value: 'handover', label: 'Handover', color: 'bg-green-200' },
  { value: 'active', label: 'Active', color: 'bg-green-300' },
  { value: 'completed', label: 'Completed', color: 'bg-green-400' }
];

const formatCurrency = (value) => {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)}L`;
  }
  return `₹${value.toLocaleString()}`;
};

export default function FinancialOverview() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [editedProjects, setEditedProjects] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, financialRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/admin/financial-overview`)
      ]);
      setUser(userRes.data);
      setData(financialRes.data);
      setEditedProjects({});
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 403) {
        toast.error('Super Admin access required');
        window.location.href = '/dashboard';
      }
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed');
    }
  };

  const handleInputChange = (projectId, field, value) => {
    setEditedProjects(prev => ({
      ...prev,
      [projectId]: {
        ...prev[projectId],
        [field]: parseFloat(value) || 0
      }
    }));
  };

  const handleStatusChange = (projectId, status) => {
    setEditedProjects(prev => ({
      ...prev,
      [projectId]: {
        ...prev[projectId],
        status
      }
    }));
  };

  const getProjectValue = (project, field) => {
    if (editedProjects[project.project_id]?.[field] !== undefined) {
      return editedProjects[project.project_id][field];
    }
    return project[field];
  };

  const calculateProjectValues = (project) => {
    const projectValue = getProjectValue(project, 'project_value');
    const additionalCost = getProjectValue(project, 'additional_cost');
    const incomeProject = getProjectValue(project, 'income_project');
    const incomeAdditional = getProjectValue(project, 'income_additional');
    const totalExpense = getProjectValue(project, 'total_expense');

    const valueTotal = projectValue + additionalCost;
    const incomeTotal = incomeProject + incomeAdditional;
    const balanceProject = projectValue - incomeProject;
    const balanceAdditional = additionalCost - incomeAdditional;
    const balanceTotal = balanceProject + balanceAdditional;
    const cashInBook = incomeTotal - totalExpense;

    return {
      valueTotal,
      incomeTotal,
      balanceProject,
      balanceAdditional,
      balanceTotal,
      cashInBook
    };
  };

  const calculateSummary = () => {
    if (!data?.projects) return null;
    
    let summary = {
      totalProjectValue: 0,
      totalAdditionalCost: 0,
      totalValue: 0,
      totalIncomeProject: 0,
      totalIncomeAdditional: 0,
      totalIncome: 0,
      totalBalanceProject: 0,
      totalBalanceAdditional: 0,
      totalBalance: 0,
      totalExpense: 0,
      totalCashInBook: 0
    };

    data.projects.forEach(project => {
      const projectValue = getProjectValue(project, 'project_value');
      const additionalCost = getProjectValue(project, 'additional_cost');
      const incomeProject = getProjectValue(project, 'income_project');
      const incomeAdditional = getProjectValue(project, 'income_additional');
      const totalExpense = getProjectValue(project, 'total_expense');
      const calc = calculateProjectValues(project);

      summary.totalProjectValue += projectValue;
      summary.totalAdditionalCost += additionalCost;
      summary.totalValue += calc.valueTotal;
      summary.totalIncomeProject += incomeProject;
      summary.totalIncomeAdditional += incomeAdditional;
      summary.totalIncome += calc.incomeTotal;
      summary.totalBalanceProject += calc.balanceProject;
      summary.totalBalanceAdditional += calc.balanceAdditional;
      summary.totalBalance += calc.balanceTotal;
      summary.totalExpense += totalExpense;
      summary.totalCashInBook += calc.cashInBook;
    });

    return summary;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [projectId, changes] of Object.entries(editedProjects)) {
        const updateData = {};
        if (changes.project_value !== undefined) updateData.total_value = changes.project_value;
        if (changes.additional_cost !== undefined) updateData.additional_cost = changes.additional_cost;
        if (changes.income_project !== undefined) updateData.income_project = changes.income_project;
        if (changes.income_additional !== undefined) updateData.income_additional = changes.income_additional;
        if (changes.total_expense !== undefined) updateData.total_expense = changes.total_expense;
        if (changes.status !== undefined) updateData.status = changes.status;

        if (Object.keys(updateData).length > 0) {
          await axios.patch(`${API}/projects/${projectId}`, updateData);
        }
      }
      toast.success('Changes saved successfully');
      fetchData();
    } catch (error) {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = Object.keys(editedProjects).length > 0;

  if (!user || !data) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const summary = calculateSummary();
  const getStatusColor = (status) => {
    return STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-gray-200';
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">ConstructionOS</h1>
              <p className="text-xs text-gray-500">Super Admin View</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => window.location.href = '/dashboard'}>
              Dashboard
            </Button>
            <Button variant="ghost" onClick={() => window.location.href = '/projects'}>
              Projects
            </Button>
            <div className="flex items-center gap-2 pl-4 border-l">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">SUPER ADMIN</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-full mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 data-testid="financial-overview-title" className="text-2xl font-bold text-gray-900">
            Financial Overview - Super Admin View
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchData} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            {hasChanges && (
              <Button onClick={handleSave} disabled={saving} className="gap-2 bg-green-600 hover:bg-green-700">
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {/* Column Group Headers */}
                <tr className="border-b-2 border-gray-300">
                  <th colSpan="3" className="bg-gray-50 px-2 py-2 text-center font-bold border-r-2">
                    Basic Info
                  </th>
                  <th colSpan="4" className="bg-yellow-100 px-2 py-2 text-center font-bold border-r-2">
                    Project Value
                  </th>
                  <th colSpan="3" className="bg-green-100 px-2 py-2 text-center font-bold border-r-2">
                    Income
                  </th>
                  <th colSpan="3" className="bg-blue-100 px-2 py-2 text-center font-bold border-r-2">
                    Balance
                  </th>
                  <th className="bg-red-100 px-2 py-2 text-center font-bold border-r-2">
                    Expense
                  </th>
                  <th className="bg-cyan-100 px-2 py-2 text-center font-bold">
                    Cash
                  </th>
                </tr>
                {/* Column Headers */}
                <tr className="border-b-2 border-gray-400 text-xs">
                  <th className="bg-gray-50 px-2 py-2 text-left">Sno</th>
                  <th className="bg-gray-50 px-2 py-2 text-left">Project Name</th>
                  <th className="bg-gray-50 px-2 py-2 text-left border-r-2">Project ID</th>
                  
                  <th className="bg-yellow-50 px-2 py-2 text-center">Status</th>
                  <th className="bg-yellow-50 px-2 py-2 text-right">Project Total</th>
                  <th className="bg-yellow-50 px-2 py-2 text-right">Additional</th>
                  <th className="bg-yellow-50 px-2 py-2 text-right border-r-2">Total</th>
                  
                  <th className="bg-green-50 px-2 py-2 text-right">Project</th>
                  <th className="bg-green-50 px-2 py-2 text-right">Additional</th>
                  <th className="bg-green-50 px-2 py-2 text-right border-r-2">Total</th>
                  
                  <th className="bg-blue-50 px-2 py-2 text-right">Project</th>
                  <th className="bg-blue-50 px-2 py-2 text-right">Additional</th>
                  <th className="bg-blue-50 px-2 py-2 text-right border-r-2">Total</th>
                  
                  <th className="bg-red-50 px-2 py-2 text-right border-r-2">Total Expense</th>
                  <th className="bg-cyan-50 px-2 py-2 text-right">Cash in Book</th>
                </tr>
                {/* Summary Row */}
                {summary && (
                  <tr className="border-b-2 border-gray-500 bg-gray-200 font-bold text-xs">
                    <td colSpan="3" className="px-2 py-2 border-r-2">TOTAL</td>
                    <td className="px-2 py-2"></td>
                    <td className="px-2 py-2 text-right bg-yellow-200">{formatCurrency(summary.totalProjectValue)}</td>
                    <td className="px-2 py-2 text-right bg-yellow-200">{formatCurrency(summary.totalAdditionalCost)}</td>
                    <td className="px-2 py-2 text-right bg-yellow-200 border-r-2">{formatCurrency(summary.totalValue)}</td>
                    <td className="px-2 py-2 text-right bg-green-200">{formatCurrency(summary.totalIncomeProject)}</td>
                    <td className="px-2 py-2 text-right bg-green-200">{formatCurrency(summary.totalIncomeAdditional)}</td>
                    <td className="px-2 py-2 text-right bg-green-200 border-r-2">{formatCurrency(summary.totalIncome)}</td>
                    <td className="px-2 py-2 text-right bg-blue-200">{formatCurrency(summary.totalBalanceProject)}</td>
                    <td className="px-2 py-2 text-right bg-blue-200">{formatCurrency(summary.totalBalanceAdditional)}</td>
                    <td className="px-2 py-2 text-right bg-blue-200 border-r-2">{formatCurrency(summary.totalBalance)}</td>
                    <td className="px-2 py-2 text-right bg-red-200 border-r-2">{formatCurrency(summary.totalExpense)}</td>
                    <td className="px-2 py-2 text-right bg-cyan-200">{formatCurrency(summary.totalCashInBook)}</td>
                  </tr>
                )}
              </thead>
              <tbody>
                {data.projects.map((project, idx) => {
                  const calc = calculateProjectValues(project);
                  const currentStatus = editedProjects[project.project_id]?.status || project.status;
                  
                  return (
                    <tr key={project.project_id} className="border-b hover:bg-gray-50" data-testid={`fin-row-${project.project_id}`}>
                      {/* Basic Info */}
                      <td className="px-2 py-2 text-center">{idx + 1}</td>
                      <td className="px-2 py-2 font-medium">
                        <button 
                          className="text-blue-600 hover:underline text-left"
                          onClick={() => window.location.href = `/projects/${project.project_id}`}
                        >
                          {project.name}
                        </button>
                      </td>
                      <td className="px-2 py-2 text-gray-500 text-xs border-r-2">{project.project_id}</td>
                      
                      {/* Status (INPUT) */}
                      <td className={`px-1 py-1 ${getStatusColor(currentStatus)}`}>
                        <Select
                          value={currentStatus}
                          onValueChange={(v) => handleStatusChange(project.project_id, v)}
                        >
                          <SelectTrigger className="h-7 text-xs border-0 bg-transparent">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      
                      {/* Project Value - INPUT */}
                      <td className="px-1 py-1 bg-red-50">
                        <Input
                          type="number"
                          className="h-7 text-xs text-right w-24 bg-red-100 border-red-300"
                          value={getProjectValue(project, 'project_value')}
                          onChange={(e) => handleInputChange(project.project_id, 'project_value', e.target.value)}
                        />
                      </td>
                      {/* Additional Cost - INPUT */}
                      <td className="px-1 py-1 bg-red-50">
                        <Input
                          type="number"
                          className="h-7 text-xs text-right w-24 bg-red-100 border-red-300"
                          value={getProjectValue(project, 'additional_cost')}
                          onChange={(e) => handleInputChange(project.project_id, 'additional_cost', e.target.value)}
                        />
                      </td>
                      {/* Value Total - CALCULATED */}
                      <td className="px-2 py-2 text-right font-medium bg-yellow-50 border-r-2">
                        {formatCurrency(calc.valueTotal)}
                      </td>
                      
                      {/* Income Project - INPUT */}
                      <td className="px-1 py-1 bg-red-50">
                        <Input
                          type="number"
                          className="h-7 text-xs text-right w-24 bg-red-100 border-red-300"
                          value={getProjectValue(project, 'income_project')}
                          onChange={(e) => handleInputChange(project.project_id, 'income_project', e.target.value)}
                        />
                      </td>
                      {/* Income Additional - INPUT */}
                      <td className="px-1 py-1 bg-red-50">
                        <Input
                          type="number"
                          className="h-7 text-xs text-right w-24 bg-red-100 border-red-300"
                          value={getProjectValue(project, 'income_additional')}
                          onChange={(e) => handleInputChange(project.project_id, 'income_additional', e.target.value)}
                        />
                      </td>
                      {/* Income Total - CALCULATED */}
                      <td className="px-2 py-2 text-right font-medium bg-green-50 border-r-2">
                        {formatCurrency(calc.incomeTotal)}
                      </td>
                      
                      {/* Balance Project - CALCULATED */}
                      <td className="px-2 py-2 text-right bg-blue-50">
                        {formatCurrency(calc.balanceProject)}
                      </td>
                      {/* Balance Additional - CALCULATED */}
                      <td className="px-2 py-2 text-right bg-blue-50">
                        {formatCurrency(calc.balanceAdditional)}
                      </td>
                      {/* Balance Total - CALCULATED */}
                      <td className="px-2 py-2 text-right font-medium bg-blue-50 border-r-2">
                        {formatCurrency(calc.balanceTotal)}
                      </td>
                      
                      {/* Total Expense - INPUT */}
                      <td className="px-1 py-1 bg-red-50 border-r-2">
                        <Input
                          type="number"
                          className="h-7 text-xs text-right w-24 bg-red-100 border-red-300"
                          value={getProjectValue(project, 'total_expense')}
                          onChange={(e) => handleInputChange(project.project_id, 'total_expense', e.target.value)}
                        />
                      </td>
                      
                      {/* Cash in Book - CALCULATED */}
                      <td className={`px-2 py-2 text-right font-medium ${calc.cashInBook >= 0 ? 'bg-cyan-50 text-cyan-700' : 'bg-red-100 text-red-700'}`}>
                        {formatCurrency(calc.cashInBook)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mt-4 text-sm text-gray-500">
          <p><span className="inline-block w-4 h-4 bg-red-100 border border-red-300 mr-2"></span> Red highlighted cells are INPUT fields (editable)</p>
          <p><span className="inline-block w-4 h-4 bg-gray-100 mr-2"></span> Other cells are auto-calculated</p>
        </div>
      </div>
    </div>
  );
}
