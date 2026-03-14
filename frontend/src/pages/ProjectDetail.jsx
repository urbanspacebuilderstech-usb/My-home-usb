import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  Building2, LogOut, ArrowLeft, ArrowRight, Plus, Edit, Trash2, Save, X,
  DollarSign, FileText, TrendingUp, Wallet, MinusCircle, CheckCircle2, Clock,
  AlertTriangle, Check, XCircle, ShieldCheck, Send, Upload, Printer, Download, Folder,
  ArrowDownRight, ArrowUpRight, RefreshCw, Eye, Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { generateREPDF } from '../utils/pdfGenerator';
import { FileUpload, FileList } from '../components/FileUpload';
import { AppHeader } from '../components/AppHeader';
import GanttChart from '../components/GanttChart';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Initial empty rows for bulk add
const createEmptyRows = (type, count = 3) => {
  if (type === 'scope') {
    return Array(count).fill(null).map(() => ({ item_name: '', quantity: '1', unit: 'Nos', unit_rate: '', remarks: '' }));
  } else if (type === 'payment') {
    return Array(count).fill(null).map(() => ({ stage_name: '', percentage: '', amount: '', due_date: '' }));
  } else if (type === 'addition') {
    return Array(count).fill(null).map(() => ({ description: '', estimated_amount: '' }));
  } else if (type === 'deduction') {
    return Array(count).fill(null).map(() => ({ description: '', amount: '', remarks: '' }));
  }
  return [];
};

const WorkflowBadge = ({ status }) => {
  const config = {
    draft: { label: 'Active', color: 'bg-green-100 text-green-700', icon: Check },
    pending_verification: { label: 'Active', color: 'bg-green-100 text-green-700', icon: Check },
    pending_approval: { label: 'Active', color: 'bg-green-100 text-green-700', icon: Check },
    approved: { label: 'Active', color: 'bg-green-100 text-green-700', icon: Check },
    rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle }
  };
  const cfg = config[status] || config.draft;
  const Icon = cfg.icon;
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
};

// ============ PAYMENT SUMMARY SECTION WITH INCOME/EXPENSE VIEWS ============
const fmtFull = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0';

function PaymentSummarySection({ user, projectId, paymentSummary, formatCurrency, handleGenerateSchedule, getPaymentStatusBadge, openCollectDialog }) {
  const [incomeData, setIncomeData] = useState(null);
  const [expenseData, setExpenseData] = useState(null);
  const [loadingFinance, setLoadingFinance] = useState(true);
  const [financeTab, setFinanceTab] = useState('income');

  const canSeeTotals = ['super_admin', 'accountant'].includes(user?.role);
  const canSeePaymentDetails = ['super_admin', 'accountant', 'general_manager', 'planning'].includes(user?.role);

  useEffect(() => {
    if (canSeePaymentDetails) {
      (async () => {
        try {
          const [incRes, expRes] = await Promise.all([
            axios.get(`${API}/projects/${projectId}/income`).catch(() => null),
            axios.get(`${API}/projects/${projectId}/expenses`).catch(() => null),
          ]);
          if (incRes) setIncomeData(incRes.data);
          if (expRes) setExpenseData(expRes.data);
        } catch { /* ignore */ }
        setLoadingFinance(false);
      })();
    } else {
      setLoadingFinance(false);
    }
  }, [projectId, canSeePaymentDetails]);

  const incomeEntries = incomeData?.entries || [];
  const incomeSummary = incomeData?.summary || {};
  const expenseSummary = expenseData?.summary || {};
  const materialExpenses = expenseData?.material || [];
  const labourExpenses = expenseData?.labour || [];
  const vendorExpenses = expenseData?.vendor_service || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold">Payment Summary</h3>
          <p className="text-xs sm:text-sm text-gray-500">Complete payment schedule from advance to handover</p>
        </div>
        {user?.role === 'planning' && (!paymentSummary || paymentSummary.payment_stages?.length === 0) && (
          <Button onClick={handleGenerateSchedule} className="bg-green-600 hover:bg-green-700">
            <Plus className="h-4 w-4 mr-2" /> Generate Payment Schedule
          </Button>
        )}
      </div>

      {/* Totals - Only for Super Admin & Accountant */}
      {canSeeTotals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="payment-summary-totals">
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Total Income</p>
              <p className="text-lg font-bold text-green-700">{fmtFull(incomeSummary.total_income)}</p>
              <p className="text-[10px] text-gray-400">{incomeEntries.length} entries</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Total Expense</p>
              <p className="text-lg font-bold text-red-600">{fmtFull(expenseSummary.total_expenses)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Total Paid</p>
              <p className="text-lg font-bold text-blue-600">{fmtFull(expenseSummary.total_paid)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Net Balance</p>
              <p className={`text-lg font-bold ${(incomeSummary.total_income || 0) - (expenseSummary.total_expenses || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {fmtFull((incomeSummary.total_income || 0) - (expenseSummary.total_expenses || 0))}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Summary Cards */}
      {paymentSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
            <CardContent className="p-3">
              <p className="text-xs text-indigo-600 font-medium">Project Value</p>
              <p className="text-lg font-bold text-indigo-700">{formatCurrency(paymentSummary.project_value || 0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
            <CardContent className="p-3">
              <p className="text-xs text-emerald-600 font-medium">Advance Paid</p>
              <p className="text-lg font-bold text-emerald-700">{formatCurrency(paymentSummary.advance_payment?.amount || 0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-3">
              <p className="text-xs text-amber-600 font-medium">Stages Scheduled</p>
              <p className="text-lg font-bold text-amber-700">{formatCurrency(paymentSummary.summary?.total_scheduled || 0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-3">
              <p className="text-xs text-green-600 font-medium">Total Received</p>
              <p className="text-lg font-bold text-green-700">{formatCurrency(paymentSummary.summary?.total_received || 0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-3">
              <p className="text-xs text-orange-600 font-medium">Balance Due</p>
              <p className="text-lg font-bold text-orange-700">{formatCurrency(paymentSummary.summary?.total_balance || 0)}</p>
              <p className="text-[10px] text-orange-500">{paymentSummary.summary?.collection_percentage?.toFixed(1) || 0}% collected</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Income / Expense Mini Views - Visible to GM, Planning, Super Admin, Accountant */}
      {canSeePaymentDetails && (
        <Card data-testid="income-expense-section">
          <CardHeader className="pb-0 pt-3 px-4 border-b">
            <Tabs value={financeTab} onValueChange={setFinanceTab}>
              <TabsList className="grid grid-cols-2 w-full max-w-xs">
                <TabsTrigger value="income" className="gap-1.5 data-[state=active]:bg-green-100 data-[state=active]:text-green-800" data-testid="project-income-tab">
                  <ArrowDownRight className="h-3.5 w-3.5" /> Income ({incomeEntries.length})
                </TabsTrigger>
                <TabsTrigger value="expense" className="gap-1.5 data-[state=active]:bg-red-100 data-[state=active]:text-red-800" data-testid="project-expense-tab">
                  <ArrowUpRight className="h-3.5 w-3.5" /> Expense
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            {loadingFinance ? (
              <div className="flex justify-center py-8"><RefreshCw className="h-5 w-5 animate-spin text-amber-600" /></div>
            ) : financeTab === 'income' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="project-income-table">
                  <thead className="bg-green-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Mode</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Reference</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {incomeEntries.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-6 text-gray-400">No income entries</td></tr>
                    ) : incomeEntries.map((e, i) => (
                      <tr key={e.income_id || i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2">{new Date(e.payment_date || e.created_at).toLocaleDateString('en-IN')}</td>
                        <td className="px-3 py-2 font-medium">{e.stage || e.description || 'Payment'}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-[10px] capitalize">{e.payment_mode?.replace('_', ' ') || 'Cash'}</Badge></td>
                        <td className="px-3 py-2 font-mono text-[10px]">{e.reference_number || e.cheque_number || '-'}</td>
                        <td className="px-3 py-2 text-right font-bold text-green-700">{fmtFull(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {canSeeTotals && incomeEntries.length > 0 && (
                    <tfoot className="bg-green-50 border-t-2 font-semibold">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-right text-gray-600">Total Income:</td>
                        <td className="px-3 py-2 text-right text-green-700 text-sm">{fmtFull(incomeSummary.total_income)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="project-expense-table">
                  <thead className="bg-red-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Vendor</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {materialExpenses.length === 0 && labourExpenses.length === 0 && vendorExpenses.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-6 text-gray-400">No expense entries</td></tr>
                    ) : (
                      <>
                        {materialExpenses.map((e, i) => (
                          <tr key={e.expense_id || `m-${i}`} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                            <td className="px-3 py-2"><Badge className="bg-blue-100 text-blue-700 text-[10px]">Material</Badge></td>
                            <td className="px-3 py-2 font-medium">{e.material_name || e.description || '-'}</td>
                            <td className="px-3 py-2 text-gray-600">{e.vendor_name || '-'}</td>
                            <td className="px-3 py-2 text-right font-bold text-red-600">{fmtFull(e.final_amount || e.amount)}</td>
                            <td className="px-3 py-2 text-right text-green-600">{fmtFull(e.total_paid)}</td>
                          </tr>
                        ))}
                        {labourExpenses.map((e, i) => (
                          <tr key={e.expense_id || `l-${i}`} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{materialExpenses.length + i + 1}</td>
                            <td className="px-3 py-2"><Badge className="bg-purple-100 text-purple-700 text-[10px]">Labour</Badge></td>
                            <td className="px-3 py-2 font-medium">{e.description || e.worker_name || '-'}</td>
                            <td className="px-3 py-2 text-gray-600">{e.contractor_name || '-'}</td>
                            <td className="px-3 py-2 text-right font-bold text-red-600">{fmtFull(e.total_amount)}</td>
                            <td className="px-3 py-2 text-right text-green-600">{fmtFull(e.total_paid)}</td>
                          </tr>
                        ))}
                        {vendorExpenses.map((e, i) => (
                          <tr key={e.expense_id || `v-${i}`} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{materialExpenses.length + labourExpenses.length + i + 1}</td>
                            <td className="px-3 py-2"><Badge className="bg-amber-100 text-amber-700 text-[10px]">Vendor</Badge></td>
                            <td className="px-3 py-2 font-medium">{e.service_name || e.description || '-'}</td>
                            <td className="px-3 py-2 text-gray-600">{e.vendor_name || '-'}</td>
                            <td className="px-3 py-2 text-right font-bold text-red-600">{fmtFull(e.amount)}</td>
                            <td className="px-3 py-2 text-right text-green-600">{fmtFull(e.total_paid)}</td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                  {canSeeTotals && (materialExpenses.length > 0 || labourExpenses.length > 0 || vendorExpenses.length > 0) && (
                    <tfoot className="bg-red-50 border-t-2 font-semibold">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right text-gray-600">Total Expense:</td>
                        <td className="px-3 py-2 text-right text-red-600 text-sm">{fmtFull(expenseSummary.total_expenses)}</td>
                        <td className="px-3 py-2 text-right text-green-600 text-sm">{fmtFull(expenseSummary.total_paid)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stage-wise Payment Schedule */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4" /> Stage-wise Payment Schedule
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b-2 border-gray-200">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">S.No</th>
                <th className="px-3 py-3 text-left font-semibold">Payment Stage</th>
                <th className="px-3 py-3 text-right font-semibold">%</th>
                <th className="px-3 py-3 text-right font-semibold">Amount</th>
                <th className="px-3 py-3 text-right font-semibold">Received</th>
                <th className="px-3 py-3 text-center font-semibold">Mode</th>
                <th className="px-3 py-3 text-center font-semibold">Date</th>
                <th className="px-3 py-3 text-center font-semibold">Status</th>
                <th className="px-3 py-3 text-left font-semibold">Remarks</th>
                {(user?.role === 'cre' || user?.role === 'super_admin') && (
                  <th className="px-3 py-3 text-center font-semibold">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(!paymentSummary?.payment_stages || paymentSummary.payment_stages.length === 0) ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">No payment schedule created yet.</td></tr>
              ) : paymentSummary.payment_stages.map((stage, idx) => {
                const isPaid = stage.status === 'paid';
                return (
                  <tr key={stage.stage_id} className={`hover:bg-gray-50 ${isPaid ? 'bg-green-50' : ''}`}>
                    <td className="px-3 py-3 font-medium">{stage.stage_label || idx + 1}</td>
                    <td className="px-3 py-3 max-w-xs"><p className="font-medium truncate">{stage.stage_name}</p></td>
                    <td className="px-3 py-3 text-right">{stage.percentage}%</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatCurrency(stage.amount)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-green-600">{formatCurrency(stage.amount_received || 0)}</td>
                    <td className="px-3 py-3 text-center text-xs">
                      {stage.payment_mode ? <Badge variant="outline" className="capitalize">{stage.payment_mode.replace('_', ' ')}</Badge> : '-'}
                    </td>
                    <td className="px-3 py-3 text-center text-xs">{stage.payment_date ? new Date(stage.payment_date).toLocaleDateString('en-IN') : '-'}</td>
                    <td className="px-3 py-3 text-center">{getPaymentStatusBadge(stage.status)}</td>
                    <td className="px-3 py-3 text-xs text-gray-500 max-w-xs truncate">{stage.remarks || '-'}</td>
                    {(user?.role === 'cre' || user?.role === 'super_admin') && (
                      <td className="px-3 py-3 text-center">
                        {!isPaid ? (
                          <Button size="sm" variant="outline" className="text-green-600 border-green-300 hover:bg-green-50"
                            onClick={() => openCollectDialog(stage)}>
                            <DollarSign className="h-3 w-3 mr-1" /> Collect
                          </Button>
                        ) : <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {paymentSummary?.payment_stages?.length > 0 && (
              <tfoot className="bg-gray-100 font-semibold">
                <tr>
                  <td colSpan={2} className="px-3 py-3">Total</td>
                  <td className="px-3 py-3 text-right">100%</td>
                  <td className="px-3 py-3 text-right">{formatCurrency(paymentSummary.summary?.total_scheduled)}</td>
                  <td className="px-3 py-3 text-right text-green-600">{formatCurrency(paymentSummary.summary?.total_received)}</td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projectData, setProjectData] = useState(null);
  const [activeTab, setActiveTab] = useState('rough-estimate');
  
  // Bulk dialog states
  const [bulkScopeDialog, setBulkScopeDialog] = useState(false);
  const [bulkPaymentDialog, setBulkPaymentDialog] = useState(false);
  const [bulkAdditionDialog, setBulkAdditionDialog] = useState(false);
  const [bulkDeductionDialog, setBulkDeductionDialog] = useState(false);
  
  // Verification dialog
  const [verifyDialog, setVerifyDialog] = useState({ open: false, type: '', ids: [] });
  const [verifyCode, setVerifyCode] = useState('');
  
  // Multi-select for bulk delete
  const [selectedScopeIds, setSelectedScopeIds] = useState([]);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState([]);
  
  // Project Stages
  const [projectStages, setProjectStages] = useState([]);
  const [stageTemplates, setStageTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [showAddStages, setShowAddStages] = useState(false);
  const [newStages, setNewStages] = useState([{ stage_name: '', start_date: '', target_date: '', status: 'yet_to_start', remarks: '' }]);
  const [saveTemplateDialog, setSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [editingStageId, setEditingStageId] = useState(null);
  const [editStageData, setEditStageData] = useState({});
  const [stagesView, setStagesView] = useState('table'); // 'table' or 'gantt'
  
  // Bulk form data
  const [bulkScopeRows, setBulkScopeRows] = useState(createEmptyRows('scope'));
  const [bulkPaymentRows, setBulkPaymentRows] = useState(createEmptyRows('payment'));
  const [bulkAdditionRows, setBulkAdditionRows] = useState(createEmptyRows('addition'));
  const [bulkDeductionRows, setBulkDeductionRows] = useState(createEmptyRows('deduction'));
  
  // Editing states
  const [editingPayment, setEditingPayment] = useState(null);
  const [editingAddition, setEditingAddition] = useState(null);
  const [editingScopeItem, setEditingScopeItem] = useState(null);
  const [editScopeForm, setEditScopeForm] = useState({ item_name: '', quantity: 1, unit: 'Nos', unit_rate: 0, remarks: '' });
  const [deleteProjectDialog, setDeleteProjectDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  
  // Payment Schedule Edit Dialog states
  const [editPaymentDialog, setEditPaymentDialog] = useState(false);
  const [editPaymentStage, setEditPaymentStage] = useState(null);
  const [editPaymentForm, setEditPaymentForm] = useState({ stage_name: '', percentage: '', amount: '', due_date: '' });
  const [submitScheduleDialog, setSubmitScheduleDialog] = useState(false);
  
  // Payment Summary state
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [collectPaymentDialog, setCollectPaymentDialog] = useState(false);
  const [selectedStage, setSelectedStage] = useState(null);
  const [collectForm, setCollectForm] = useState({ amount_received: '', payment_mode: 'bank_transfer', payment_reference: '', remarks: '' });
  
  // Rough Estimate state
  const [reProject, setReProject] = useState(null);
  const [projectFiles, setProjectFiles] = useState([]);
  const [designData, setDesignData] = useState({ site_plans: [], design_files: [] });

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      setUser(userRes.data);
      
      // Redirect Site Engineers to their dedicated board
      if (userRes.data.role === 'site_engineer') {
        window.location.href = `/site-engineer/project/${projectId}`;
        return;
      }
      
      const projectRes = await axios.get(`${API}/projects/${projectId}/full-details`);
      setProjectData(projectRes.data);
      
      // Fetch Rough Estimate (RE) project if available
      if (projectRes.data.project?.re_project_id) {
        try {
          const reRes = await axios.get(`${API}/crm/re-projects/${projectRes.data.project.re_project_id}`);
          setReProject(reRes.data);
        } catch (e) {
          console.log('RE project not available');
        }
      }
      
      // Fetch payment summary
      try {
        const summaryRes = await axios.get(`${API}/projects/${projectId}/payment-summary`);
        setPaymentSummary(summaryRes.data);
      } catch (e) {
        console.log('Payment summary not available');
      }
      
      // Fetch project files
      fetchProjectFiles();
      fetchDesignData();
      
      // Fetch project stages and templates
      try {
        const [stagesRes, templatesRes] = await Promise.all([
          axios.get(`${API}/projects/${projectId}/project-stages`),
          axios.get(`${API}/stage-templates`)
        ]);
        setProjectStages(stagesRes.data);
        setStageTemplates(templatesRes.data);
      } catch (e) {
        console.log('Stages not available');
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load project data');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectFiles = async () => {
    try {
      const res = await axios.get(`${API}/files?project_id=${projectId}`, { withCredentials: true });
      setProjectFiles(res.data);
    } catch {
      // Files endpoint may not have data yet
    }
  };

  const fetchDesignData = async () => {
    try {
      const res = await axios.get(`${API}/architect/projects/${projectId}/all-design-data`);
      setDesignData(res.data || { site_plans: [], design_files: [] });
    } catch {
      // Design data may not exist
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

  // Format currency for PDF
  // Generate PDF handler using shared utility
  const handleGenerateREPDF = async () => {
    if (!reProject) {
      toast.error('No Rough Estimate available');
      return;
    }
    try {
      await generateREPDF(reProject);
      toast.success('Rough Estimate PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF');
    }
  };

  const handleConvertToScope = async () => {
    const scopeItems = reProject?.rough_scope_items || reProject?.scope_items || [];
    if (!scopeItems.length) {
      toast.error('No scope items in the Rough Estimate to convert');
      setActiveTab('scope');
      return;
    }
    
    // Check if already converted (scope items from RE already exist)
    const existingFromRE = (projectData?.scope_items || []).filter(
      s => s.remarks && s.remarks.includes('From RE:')
    );
    if (existingFromRE.length > 0) {
      toast.error('Scope items already converted from Rough Estimate');
      setActiveTab('scope');
      return;
    }
    
    try {
      const items = scopeItems.map(item => ({
        item_name: item.name || item.item_name,
        quantity: parseFloat(item.quantity) || 1,
        unit: item.unit || 'Nos',
        unit_rate: parseFloat(item.rate || item.unit_rate) || 0,
        remarks: `From RE: ${reProject.project_name || ''}`
      }));
      
      await axios.post(`${API}/scope-items/bulk`, {
        project_id: projectId,
        items
      });
      
      toast.success(`Converted ${items.length} RE items to project scope`);
      await fetchData();
      setActiveTab('scope');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to convert to scope');
    }
  };

  // ==================== BULK ADD HANDLERS ====================
  const handleBulkAddScope = async () => {
    const validItems = bulkScopeRows.filter(r => r.item_name && r.unit_rate);
    if (validItems.length === 0) {
      toast.error('Please fill at least one complete row');
      return;
    }
    
    try {
      await axios.post(`${API}/scope-items/bulk`, {
        project_id: projectId,
        items: validItems.map(r => ({
          item_name: r.item_name,
          quantity: parseFloat(r.quantity) || 1,
          unit: r.unit || 'Nos',
          unit_rate: parseFloat(r.unit_rate) || 0,
          remarks: r.remarks || null
        }))
      });
      toast.success(`Added ${validItems.length} scope items`);
      setBulkScopeDialog(false);
      setBulkScopeRows(createEmptyRows('scope'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add scope items');
    }
  };

  const handleBulkAddPayment = async () => {
    const validItems = bulkPaymentRows.filter(r => r.stage_name && r.amount);
    if (validItems.length === 0) {
      toast.error('Please fill at least one complete row');
      return;
    }
    
    // Validate: total of new stages + existing stages cannot exceed balance
    const totalValue = summary?.scope_total || projectData?.project?.total_value || 0;
    const advanceReceived = projectData?.project?.advance_amount || 0;
    const balance = totalValue - advanceReceived;
    const existingTotal = payment_stages.reduce((sum, s) => sum + (s.amount || 0), 0);
    const newTotal = validItems.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    
    if (existingTotal + newTotal > balance) {
      toast.error(`Total payment stages (₹${(existingTotal + newTotal).toLocaleString()}) exceeds balance amount (₹${balance.toLocaleString()}). Reduce amounts.`);
      return;
    }
    
    try {
      await axios.post(`${API}/payment-stages/bulk`, {
        project_id: projectId,
        items: validItems.map(r => ({
          stage_name: r.stage_name,
          percentage: parseFloat(r.percentage) || 0,
          amount: parseFloat(r.amount) || 0,
          due_date: r.due_date || null
        }))
      });
      toast.success(`Added ${validItems.length} payment stages`);
      setBulkPaymentDialog(false);
      setBulkPaymentRows(createEmptyRows('payment'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add payment stages');
    }
  };

  const handleBulkAddAddition = async () => {
    const validItems = bulkAdditionRows.filter(r => r.description && r.estimated_amount);
    if (validItems.length === 0) {
      toast.error('Please fill at least one complete row');
      return;
    }
    
    try {
      await axios.post(`${API}/additional-costs/bulk`, {
        project_id: projectId,
        items: validItems.map(r => ({
          description: r.description,
          estimated_amount: parseFloat(r.estimated_amount) || 0
        }))
      });
      toast.success(`Added ${validItems.length} additions`);
      setBulkAdditionDialog(false);
      setBulkAdditionRows(createEmptyRows('addition'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add additions');
    }
  };

  const handleBulkAddDeduction = async () => {
    const validItems = bulkDeductionRows.filter(r => r.description && r.amount);
    if (validItems.length === 0) {
      toast.error('Please fill at least one complete row');
      return;
    }
    
    try {
      await axios.post(`${API}/deductions/bulk`, {
        project_id: projectId,
        items: validItems.map(r => ({
          description: r.description,
          amount: parseFloat(r.amount) || 0,
          remarks: r.remarks || null
        }))
      });
      toast.success(`Added ${validItems.length} deductions`);
      setBulkDeductionDialog(false);
      setBulkDeductionRows(createEmptyRows('deduction'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add deductions');
    }
  };

  // ==================== VERIFICATION HANDLER ====================
  const openVerifyDialog = (type, ids) => {
    setVerifyDialog({ open: true, type, ids });
    setVerifyCode('');
  };

  const handleVerify = async () => {
    if (verifyCode !== 'VERIFY') {
      toast.error("Please type 'VERIFY' exactly in capital letters");
      return;
    }
    
    try {
      const endpoint = {
        scope: '/scope-items/verify',
        payment: '/payment-stages/verify',
        addition: '/additional-costs/verify',
        deduction: '/deductions/verify'
      }[verifyDialog.type];
      
      await axios.post(`${API}${endpoint}`, {
        item_ids: verifyDialog.ids,
        verification_code: verifyCode
      });
      
      toast.success('Items verified and sent for approval');
      setVerifyDialog({ open: false, type: '', ids: [] });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Verification failed');
    }
  };

  // ==================== APPROVAL HANDLER (Super Admin) ====================
  const handleApprove = async (type, ids, action) => {
    try {
      const endpoint = {
        scope: '/scope-items/approve',
        payment: '/payment-stages/approve',
        addition: '/additional-costs/approve',
        deduction: '/deductions/approve'
      }[type];
      
      await axios.post(`${API}${endpoint}`, { item_ids: ids, action });
      toast.success(`Items ${action}d successfully`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || `${action} failed`);
    }
  };

  // ==================== DELETE HANDLERS ====================
  const handleDeleteScope = async (scopeId) => {
    if (!confirm('Delete this scope item?')) return;
    try {
      await axios.delete(`${API}/scope-items/${scopeId}`);
      toast.success('Scope item deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete scope item');
    }
  };

  const handleDeletePayment = async (stageId) => {
    if (!confirm('Delete this payment stage?')) return;
    try {
      await axios.delete(`${API}/payment-stages/${stageId}`);
      toast.success('Payment stage deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete payment stage');
    }
  };

  const handleBulkDeleteScope = async () => {
    if (!selectedScopeIds.length) return;
    if (!confirm(`Delete ${selectedScopeIds.length} selected scope item(s)?`)) return;
    try {
      await Promise.all(selectedScopeIds.map(id => axios.delete(`${API}/scope-items/${id}`)));
      toast.success(`Deleted ${selectedScopeIds.length} scope item(s)`);
      setSelectedScopeIds([]);
      fetchData();
    } catch (error) {
      toast.error('Failed to delete some items');
    }
  };

  const handleBulkDeletePayment = async () => {
    if (!selectedPaymentIds.length) return;
    if (!confirm(`Delete ${selectedPaymentIds.length} selected payment stage(s)?`)) return;
    try {
      await Promise.all(selectedPaymentIds.map(id => axios.delete(`${API}/payment-stages/${id}`)));
      toast.success(`Deleted ${selectedPaymentIds.length} payment stage(s)`);
      setSelectedPaymentIds([]);
      fetchData();
    } catch (error) {
      toast.error('Failed to delete some stages');
    }
  };

  const toggleScopeSelect = (id) => {
    setSelectedScopeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleAllScope = () => {
    setSelectedScopeIds(prev => prev.length === scope_items.length ? [] : scope_items.map(s => s.scope_id));
  };
  const togglePaymentSelect = (id) => {
    setSelectedPaymentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleAllPayment = () => {
    setSelectedPaymentIds(prev => prev.length === payment_stages.length ? [] : payment_stages.map(p => p.stage_id));
  };

  // ---- Project Stages Handlers ----
  const handleLoadTemplate = async (name) => {
    setSelectedTemplate(name);
    if (!name) return;
    try {
      const res = await axios.get(`${API}/stage-templates/${encodeURIComponent(name)}`);
      const tmplStages = (res.data.stages || []).map(s => ({
        stage_name: s.stage_name || '',
        start_date: s.start_date || '',
        target_date: s.target_date || '',
        status: s.status || 'yet_to_start',
        remarks: s.remarks || ''
      }));
      if (tmplStages.length > 0) {
        setNewStages(tmplStages);
        setShowAddStages(true);
        toast.success(`Loaded "${name}" template with ${tmplStages.length} stages`);
      }
    } catch { toast.error('Failed to load template'); }
  };

  const addNewStageRow = () => {
    setNewStages(prev => [...prev, { stage_name: '', start_date: '', target_date: '', status: 'yet_to_start', remarks: '' }]);
  };
  const removeNewStageRow = (idx) => {
    setNewStages(prev => prev.filter((_, i) => i !== idx));
  };
  const updateNewStage = (idx, field, value) => {
    setNewStages(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleSaveStages = async () => {
    const valid = newStages.filter(s => s.stage_name.trim());
    if (!valid.length) { toast.error('Add at least one stage'); return; }
    try {
      await axios.post(`${API}/projects/${projectId}/project-stages/bulk`, valid);
      toast.success(`Added ${valid.length} stages`);
      setShowAddStages(false);
      setNewStages([{ stage_name: '', start_date: '', target_date: '', status: 'yet_to_start', remarks: '' }]);
      fetchData();
    } catch (error) { toast.error('Failed to add stages'); }
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) { toast.error('Enter template name'); return; }
    const valid = newStages.filter(s => s.stage_name.trim());
    if (!valid.length) { toast.error('Add at least one stage'); return; }
    try {
      await axios.post(`${API}/stage-templates`, { template_name: templateName, stages: valid });
      toast.success(`Template "${templateName}" saved`);
      setSaveTemplateDialog(false);
      setTemplateName('');
      const res = await axios.get(`${API}/stage-templates`);
      setStageTemplates(res.data);
    } catch (error) { toast.error('Failed to save template'); }
  };

  const handleUpdateStage = async (stageId) => {
    try {
      await axios.patch(`${API}/projects/${projectId}/project-stages/${stageId}`, editStageData);
      toast.success('Stage updated');
      setEditingStageId(null);
      fetchData();
    } catch { toast.error('Failed to update'); }
  };

  const handleDeleteStage = async (stageId) => {
    if (!confirm('Delete this stage?')) return;
    try {
      await axios.delete(`${API}/projects/${projectId}/project-stages/${stageId}`);
      toast.success('Stage deleted');
      fetchData();
    } catch { toast.error('Failed to delete'); }
  };

  const stageStatusConfig = {
    yet_to_start: { label: 'Yet to Start', color: 'bg-gray-100 text-gray-700 border-gray-300' },
    started: { label: 'Started', color: 'bg-amber-100 text-amber-700 border-amber-300' },
    finished: { label: 'Finished', color: 'bg-green-100 text-green-700 border-green-300' }
  };


  const handleRequestPayment = async (stageId) => {
    try {
      await axios.patch(`${API}/payment-stages/${stageId}/request`);
      toast.success('Payment requested - sent to CRE');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to request payment');
    }
  };

  const handleDeleteAddition = async (costId) => {
    if (!confirm('Delete this addition?')) return;
    try {
      await axios.delete(`${API}/additional-costs/${costId}`);
      toast.success('Addition deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete addition');
    }
  };

  const handleRequestAdditionPayment = async (costId) => {
    try {
      await axios.patch(`${API}/additional-costs/${costId}/request-payment`);
      toast.success('Payment requested for additional work - sent to CRE');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to request payment');
    }
  };

  const handleDeleteDeduction = async (deductionId) => {
    if (!confirm('Delete this deduction?')) return;
    try {
      await axios.delete(`${API}/deductions/${deductionId}`);
      toast.success('Deduction deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete deduction');
    }
  };

  // ==================== UPDATE HANDLERS ====================
  const handleUpdatePayment = async (stageId, updates) => {
    try {
      await axios.patch(`${API}/payment-stages/${stageId}`, updates);
      toast.success('Payment updated');
      setEditingPayment(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to update payment');
    }
  };

  // Open edit dialog for payment stage
  const openEditPaymentDialog = (stage) => {
    setEditPaymentStage(stage);
    setEditPaymentForm({
      stage_name: stage.stage_name || '',
      percentage: stage.percentage?.toString() || '',
      amount: stage.amount?.toString() || '',
      due_date: stage.due_date ? new Date(stage.due_date).toISOString().split('T')[0] : ''
    });
    setEditPaymentDialog(true);
  };

  // Handle save from edit payment dialog
  const handleSavePaymentEdit = async () => {
    if (!editPaymentStage) return;
    
    try {
      await axios.patch(`${API}/payment-stages/${editPaymentStage.stage_id}`, {
        stage_name: editPaymentForm.stage_name,
        percentage: parseFloat(editPaymentForm.percentage) || 0,
        amount: parseFloat(editPaymentForm.amount) || 0,
        due_date: editPaymentForm.due_date || null
      });
      toast.success('Payment stage updated');
      setEditPaymentDialog(false);
      setEditPaymentStage(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update payment stage');
    }
  };

  // Submit/finalize draft payment schedule
  const handleSubmitPaymentSchedule = async () => {
    try {
      await axios.post(`${API}/projects/${projectId}/payment-schedule/submit`);
      toast.success('Payment schedule submitted for collection');
      setSubmitScheduleDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit payment schedule');
    }
  };

  const handleUpdateAddition = async (costId, updates) => {
    try {
      await axios.patch(`${API}/additional-costs/${costId}`, updates);
      toast.success('Addition updated');
      setEditingAddition(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to update addition');
    }
  };

  // ==================== SCOPE ITEM EDIT HANDLERS ====================
  const openScopeEdit = (item) => {
    setEditingScopeItem(item.scope_id);
    setEditScopeForm({
      item_name: item.item_name || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'Nos',
      unit_rate: item.unit_rate || 0,
      remarks: item.remarks || ''
    });
  };

  const handleUpdateScope = async () => {
    if (!editingScopeItem) return;
    
    try {
      await axios.patch(`${API}/scope-items/${editingScopeItem}`, {
        item_name: editScopeForm.item_name,
        quantity: parseFloat(editScopeForm.quantity) || 1,
        unit: editScopeForm.unit,
        unit_rate: parseFloat(editScopeForm.unit_rate) || 0,
        remarks: editScopeForm.remarks || null
      });
      toast.success('Scope item updated');
      setEditingScopeItem(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update scope item');
    }
  };

  const cancelScopeEdit = () => {
    setEditingScopeItem(null);
    setEditScopeForm({ item_name: '', quantity: 1, unit: 'Nos', unit_rate: 0, remarks: '' });
  };

  // ==================== DELETE PROJECT HANDLER ====================
  const handleDeleteProject = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error("Please type 'DELETE' exactly in capital letters to confirm");
      return;
    }
    
    try {
      await axios.delete(`${API}/projects/${projectId}`);
      toast.success('Project deleted successfully');
      setDeleteProjectDialog(false);
      // Redirect to projects list
      window.location.href = '/projects';
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete project');
    }
  };

  // ==================== PAYMENT COLLECTION HANDLERS ====================
  const openCollectDialog = (stage) => {
    setSelectedStage(stage);
    setCollectForm({ 
      amount_received: stage.amount - (stage.amount_received || 0), 
      payment_mode: 'bank_transfer', 
      payment_reference: '', 
      remarks: '' 
    });
    setCollectPaymentDialog(true);
  };

  const handleCollectPayment = async () => {
    if (!selectedStage || !collectForm.amount_received) {
      toast.error('Please enter amount');
      return;
    }
    
    try {
      await axios.post(`${API}/payment-stages/${selectedStage.stage_id}/collect`, {
        amount_received: parseFloat(collectForm.amount_received),
        payment_mode: collectForm.payment_mode,
        payment_reference: collectForm.payment_reference || null,
        remarks: collectForm.remarks || null
      });
      toast.success('Payment collected successfully');
      setCollectPaymentDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to collect payment');
    }
  };

  const handleGenerateSchedule = async () => {
    try {
      await axios.post(`${API}/projects/${projectId}/payment-schedule/generate`);
      toast.success('Payment schedule generated');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to generate schedule');
    }
  };

  const getPaymentStatusBadge = (status) => {
    const config = {
      pending: { label: 'Pending', color: 'bg-gray-100 text-gray-700' },
      partial: { label: 'Partial', color: 'bg-yellow-100 text-yellow-700' },
      paid: { label: 'Paid', color: 'bg-green-100 text-green-700' },
      collected: { label: 'Collected', color: 'bg-amber-50 text-amber-700' }
    };
    const c = config[status] || config.pending;
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.color}`}>{c.label}</span>;
  };

  const canDeleteProject = user?.role === 'super_admin' || 
    (user?.role === 'planning' && (
      ['in_planning', 'draft', 'pending', 'planning'].includes(projectData?.project?.status?.toLowerCase()) ||
      ['in_planning', 'draft', 'pending', 'planning'].includes(projectData?.project?.project_stage?.toLowerCase())
    ));

  const formatCurrency = (amount) => {
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)}L`;
    }
    return `₹${amount?.toLocaleString() || 0}`;
  };

  const canManage = user?.role === 'super_admin' || user?.role === 'project_manager' || user?.role === 'accountant' || user?.role === 'planning';
  const isSuperAdmin = user?.role === 'super_admin';
  const isPM = user?.role === 'project_manager';
  const canSeeFinancials = !isPM;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600">Loading project...</div>
      </div>
    );
  }

  if (!projectData || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-red-600">Failed to load project</div>
      </div>
    );
  }

  const { project, scope_items, payment_stages, additional_costs, deductions, summary } = projectData;

  // Get draft items for verification
  const draftScopeItems = scope_items.filter(s => s.workflow_status === 'draft');
  const draftPaymentItems = payment_stages.filter(p => p.workflow_status === 'draft');
  const draftAdditions = additional_costs.filter(a => a.workflow_status === 'draft');
  const draftDeductions = deductions.filter(d => d.workflow_status === 'draft');
  
  // Get pending approval items
  const pendingApprovalScope = scope_items.filter(s => s.workflow_status === 'pending_approval');
  const pendingApprovalPayment = payment_stages.filter(p => p.workflow_status === 'pending_approval');
  const pendingApprovalAdditions = additional_costs.filter(a => a.workflow_status === 'pending_approval');
  const pendingApprovalDeductions = deductions.filter(d => d.workflow_status === 'pending_approval');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Project Header */}
        <div className="mb-4 sm:mb-8">
          <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-4">
            <Button variant="ghost" size="icon" onClick={() => window.location.href = '/projects'} className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 data-testid="project-detail-title" className="text-xl sm:text-3xl font-bold text-gray-900 truncate">
                {project.name}
              </h2>
              <div className="flex items-center gap-2 sm:gap-4 mt-1 flex-wrap text-xs sm:text-sm">
                <span className="text-gray-600"><strong>Client:</strong> {project.client_name}</span>
                <span className="text-gray-600 hidden sm:inline"><strong>Location:</strong> {project.location}</span>
                <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>{project.status}</Badge>
              </div>
            </div>
            {/* Delete Project Button - visible for super_admin or planning (for draft/in_planning projects) */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Share as PDF Button */}
              <Button 
                data-testid="share-pdf-btn"
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">Share as PDF</span>
              </Button>
              
              {canDeleteProject && (
                <Dialog open={deleteProjectDialog} onOpenChange={setDeleteProjectDialog}>
                  <DialogTrigger asChild>
                    <Button 
                      data-testid="delete-project-btn"
                      variant="destructive" 
                      size="sm" 
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Delete Project</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="text-red-600 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Delete Project
                      </DialogTitle>
                      <DialogDescription>
                        This action <strong>cannot be undone</strong>. This will permanently delete the project 
                        <strong> "{project.name}"</strong> and all related data including scope items, payment stages, 
                        additions, and deductions.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-sm text-red-700">
                          Type <strong>DELETE</strong> to confirm:
                        </p>
                        <Input
                          data-testid="delete-confirm-input"
                          placeholder="Type DELETE to confirm"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          className="mt-2"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => { setDeleteProjectDialog(false); setDeleteConfirmText(''); }}>
                      Cancel
                    </Button>
                    <Button 
                      data-testid="confirm-delete-project-btn"
                      variant="destructive" 
                      onClick={handleDeleteProject}
                      disabled={deleteConfirmText !== 'DELETE'}
                    >
                      Delete Project
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              )}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4 mb-4 sm:mb-8">
          {canSeeFinancials && <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <DollarSign className="h-3 w-3" />Value
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-amber-700">{formatCurrency(summary.project_value)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">Scope Total</p>
            </CardContent>
          </Card>}

          {canSeeFinancials && <Card className="bg-gradient-to-br from-cyan-50 to-cyan-100 border-cyan-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Plus className="h-3 w-3" />Additions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-cyan-700">{formatCurrency(summary.additions_total)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">Extra Work</p>
            </CardContent>
          </Card>}

          {canSeeFinancials && <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <FileText className="h-3 w-3" />Total
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-purple-700">{formatCurrency(summary.total_value)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">Scope + Add</p>
            </CardContent>
          </Card>}

          {canSeeFinancials && <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />Income
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-green-700">{formatCurrency(summary.income_total)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">
                <span className="text-amber-600 cursor-pointer hover:underline" onClick={() => window.location.href = '/income'}>
                  View Income
                </span>
              </p>
            </CardContent>
          </Card>}

          {canSeeFinancials && <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <MinusCircle className="h-3 w-3" />Deductions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-orange-700">{formatCurrency(summary.deductions_total)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">Adjustments</p>
            </CardContent>
          </Card>}

          {canSeeFinancials && <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Wallet className="h-3 w-3" />Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className={`text-sm sm:text-lg font-bold ${summary.balance >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                {formatCurrency(summary.balance)}
              </div>
              <p className="text-xs text-gray-500 hidden sm:block">Pending</p>
            </CardContent>
          </Card>}
        </div>

        {/* Main Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="border-b p-3 sm:p-6">
              <TabsList className="bg-transparent border-0 p-0 h-auto flex-wrap gap-1 sm:gap-2 w-full overflow-x-auto">
                <TabsTrigger value="rough-estimate" className="data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  <FileText className="h-3 w-3 mr-1" />
                  Rough Estimate
                </TabsTrigger>
                <TabsTrigger value="scope" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  Scope
                </TabsTrigger>
                <TabsTrigger value="project-stages" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm" data-testid="tab-project-stages">
                  <Folder className="h-3 w-3 mr-1" />
                  Project Stages
                </TabsTrigger>
                {canSeeFinancials && <TabsTrigger value="payments" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  Payment Schedule
                </TabsTrigger>}
                {canSeeFinancials && <TabsTrigger value="additions" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  Additional
                </TabsTrigger>}
                {canSeeFinancials && <TabsTrigger value="deductions" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  Deduction
                </TabsTrigger>}
                {canSeeFinancials && <TabsTrigger value="payment-summary" className="data-[state=active]:border-b-2 data-[state=active]:border-green-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm bg-green-50">
                  <DollarSign className="h-3 w-3 mr-1" />
                  Payment Summary
                </TabsTrigger>}
                <TabsTrigger value="documents" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  <Folder className="h-3 w-3 mr-1" />
                  Documents {projectFiles.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{projectFiles.length}</Badge>}
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            {/* ==================== ROUGH ESTIMATE TAB ==================== */}
            <TabsContent value="rough-estimate" className="p-3 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base sm:text-lg font-bold flex items-center gap-2">
                    <FileText className="h-5 w-5 text-purple-600" />
                    Rough Estimate Reference
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500">Original rough estimate from Planning department</p>
                </div>
                {reProject && (
                  <div className="flex gap-2">
                    {(projectData?.scope_items || []).some(s => s.remarks?.includes('From RE:')) ? (
                      <Button 
                        disabled
                        className="bg-gray-400 cursor-not-allowed"
                        data-testid="convert-to-scope-btn"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Already Converted
                      </Button>
                    ) : (
                      <Button 
                        onClick={handleConvertToScope} 
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="convert-to-scope-btn"
                      >
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Convert to Scope
                      </Button>
                    )}
                    <Button 
                      onClick={handleGenerateREPDF} 
                      className="bg-purple-600 hover:bg-purple-700"
                      data-testid="download-re-pdf"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>
                  </div>
                )}
              </div>
              
              {reProject ? (
                <div className="space-y-4">
                  {/* RE Project Overview */}
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-gray-500">RE Project Name</p>
                        <p className="font-semibold">{reProject.project_name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Location</p>
                        <p className="font-medium">{reProject.location || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Area</p>
                        <p className="font-medium">{reProject.sqft?.toLocaleString()} sqft</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Building Type</p>
                        <p className="font-medium capitalize">{reProject.building_type}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div>
                        <p className="text-xs text-gray-500">Package</p>
                        <p className="font-medium">{reProject.package_name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Estimated Total</p>
                        <p className="font-bold text-purple-700">₹{(reProject.estimated_total || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Handover Timeline</p>
                        <p className="font-medium">{reProject.handover_months || '-'} months</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Status</p>
                        <Badge className={reProject.status === 'converted' ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-700'}>
                          {reProject.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  {/* RE Scope Items */}
                  {(reProject.rough_scope_items || reProject.scope_items)?.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 text-sm">Rough Estimate Scope Items</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border rounded-lg">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Item</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">Qty</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Unit</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">Rate</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(reProject.rough_scope_items || reProject.scope_items).map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-3 py-2">{item.name || item.item_name}</td>
                                <td className="px-3 py-2 text-right">{item.quantity}</td>
                                <td className="px-3 py-2">{item.unit}</td>
                                <td className="px-3 py-2 text-right">₹{(item.rate || item.unit_rate || 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right font-medium">₹{(item.total || 0).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-purple-50">
                            <tr>
                              <td colSpan="4" className="px-3 py-2 text-right font-semibold">Estimated Total:</td>
                              <td className="px-3 py-2 text-right font-bold text-purple-700">
                                ₹{(reProject.rough_scope_items || reProject.scope_items).reduce((sum, i) => sum + (i.total || 0), 0).toLocaleString()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {/* RE Payment Schedule */}
                  {reProject.payment_schedule && reProject.payment_schedule.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 text-sm">Estimated Payment Schedule</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border rounded-lg">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Stage</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">%</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {reProject.payment_schedule.map((stage, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-3 py-2">{stage.stage_name}</td>
                                <td className="px-3 py-2 text-right">{stage.percentage}%</td>
                                <td className="px-3 py-2 text-right font-medium">₹{(stage.amount || 0).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No Rough Estimate Available</p>
                  <p className="text-sm">This project was not created from a Rough Estimate</p>
                </div>
              )}
            </TabsContent>

            {/* ==================== SCOPE TAB ==================== */}
            <TabsContent value="scope" className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                <div>
                  <h3 className="text-base sm:text-lg font-bold">Project Scope</h3>
                  <p className="text-xs sm:text-sm text-gray-500">Define scope items - total becomes project value</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedScopeIds.length > 0 && (
                    <Button 
                      data-testid="bulk-delete-scope-btn"
                      variant="destructive"
                      size="sm"
                      className="gap-1 sm:gap-2 text-xs sm:text-sm"
                      onClick={handleBulkDeleteScope}
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />Delete Selected ({selectedScopeIds.length})
                    </Button>
                  )}
                  {canManage && (
                    <Dialog open={bulkScopeDialog} onOpenChange={setBulkScopeDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-scope-btn" size="sm" className="gap-1 sm:gap-2 bg-secondary hover:bg-secondary/90 text-xs sm:text-sm">
                          <Plus className="h-3 w-3 sm:h-4 sm:w-4" /><span className="hidden sm:inline">Add </span>Scope
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto">
                        <DialogHeader>
                          <DialogTitle>Add Multiple Scope Items</DialogTitle>
                          <DialogDescription>Add rows as needed. Use X to remove empty rows.</DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left w-8">#</th>
                                <th className="px-2 py-2 text-left">Item Name *</th>
                                <th className="px-2 py-2 text-left w-20">Qty</th>
                                <th className="px-2 py-2 text-left w-20">Unit</th>
                                <th className="px-2 py-2 text-left w-28">Rate (₹) *</th>
                                <th className="px-2 py-2 text-left w-28">Total</th>
                                <th className="px-2 py-2 text-left">Remarks</th>
                                <th className="px-2 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkScopeRows.map((row, idx) => (
                                <tr key={idx} className="border-b hover:bg-gray-50">
                                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.item_name}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].item_name = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      placeholder="e.g., Foundation Work"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="number"
                                      value={row.quantity}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].quantity = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.unit}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].unit = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="number"
                                      value={row.unit_rate}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].unit_rate = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1 text-amber-600 font-medium">
                                    ₹{((parseFloat(row.quantity) || 0) * (parseFloat(row.unit_rate) || 0)).toLocaleString()}
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.remarks}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].remarks = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    {bulkScopeRows.length > 1 && (
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => {
                                          const newRows = bulkScopeRows.filter((_, i) => i !== idx);
                                          setBulkScopeRows(newRows);
                                        }}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <div className="flex gap-2">
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkScopeRows([...bulkScopeRows, { item_name: '', quantity: '1', unit: 'Nos', unit_rate: '', remarks: '' }])}
                            >
                              <Plus className="h-4 w-4 mr-1" /> Add Row
                            </Button>
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkScopeRows([...bulkScopeRows, ...createEmptyRows('scope', 5)])}
                            >
                              + Add 5 Rows
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkScopeDialog(false)}>Cancel</Button>
                            <Button data-testid="submit-bulk-scope-btn" onClick={handleBulkAddScope}>Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {canManage && (
                        <th className="px-3 py-3 text-center w-10">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 h-4 w-4 cursor-pointer"
                            checked={scope_items.length > 0 && selectedScopeIds.length === scope_items.length}
                            onChange={toggleAllScope}
                            data-testid="select-all-scope"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Unit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Unit Rate</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {scope_items.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 11 : 8} className="px-4 py-8 text-center text-gray-500">
                          No scope items defined yet. Click "Add Scope Items" to define project scope.
                        </td>
                      </tr>
                    ) : (
                      scope_items.map((item, index) => {
                        const isEditing = editingScopeItem === item.scope_id;
                        
                        return (
                          <tr key={item.scope_id} data-testid={`scope-row-${item.scope_id}`} className={`hover:bg-gray-50 ${selectedScopeIds.includes(item.scope_id) ? 'bg-blue-50' : ''}`}>
                            {canManage && (
                              <td className="px-3 py-3 text-center">
                                <input 
                                  type="checkbox" 
                                  className="rounded border-gray-300 h-4 w-4 cursor-pointer"
                                  checked={selectedScopeIds.includes(item.scope_id)}
                                  onChange={() => toggleScopeSelect(item.scope_id)}
                                  data-testid={`select-scope-${item.scope_id}`}
                                />
                              </td>
                            )}
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-scope-name-${item.scope_id}`}
                                  value={editScopeForm.item_name}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, item_name: e.target.value})}
                                  className="h-8 w-full min-w-[150px]"
                                />
                              ) : (
                                item.item_name
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-scope-qty-${item.scope_id}`}
                                  type="number"
                                  value={editScopeForm.quantity}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, quantity: e.target.value})}
                                  className="h-8 w-20 text-right"
                                />
                              ) : (
                                item.quantity
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-scope-unit-${item.scope_id}`}
                                  value={editScopeForm.unit}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, unit: e.target.value})}
                                  className="h-8 w-16 text-center"
                                />
                              ) : (
                                item.unit
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-scope-rate-${item.scope_id}`}
                                  type="number"
                                  value={editScopeForm.unit_rate}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, unit_rate: e.target.value})}
                                  className="h-8 w-24 text-right"
                                />
                              ) : (
                                `₹${item.unit_rate?.toLocaleString()}`
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-amber-600">
                              {isEditing ? (
                                `₹${((parseFloat(editScopeForm.quantity) || 0) * (parseFloat(editScopeForm.unit_rate) || 0)).toLocaleString()}`
                              ) : (
                                `₹${item.total_amount?.toLocaleString()}`
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <WorkflowBadge status={item.workflow_status || 'draft'} />
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-scope-remarks-${item.scope_id}`}
                                  value={editScopeForm.remarks}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, remarks: e.target.value})}
                                  className="h-8 w-full"
                                  placeholder="Remarks"
                                />
                              ) : (
                                item.remarks || '-'
                              )}
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {isEditing ? (
                                    <>
                                      <Button 
                                        data-testid={`save-scope-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={handleUpdateScope}
                                        className="h-8 w-8"
                                      >
                                        <Save className="h-4 w-4 text-green-500" />
                                      </Button>
                                      <Button 
                                        data-testid={`cancel-scope-edit-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={cancelScopeEdit}
                                        className="h-8 w-8"
                                      >
                                        <X className="h-4 w-4 text-gray-500" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button 
                                        data-testid={`edit-scope-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => openScopeEdit(item)}
                                        className="h-8 w-8"
                                      >
                                        <Edit className="h-4 w-4 text-amber-600" />
                                      </Button>
                                      <Button 
                                        data-testid={`delete-scope-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => handleDeleteScope(item.scope_id)}
                                        className="h-8 w-8"
                                      >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {scope_items.length > 0 && (
                    <tfoot className="bg-amber-50 border-t-2">
                      <tr>
                        <td colSpan={canManage ? 7 : 5} className="px-4 py-3 text-right font-bold">Project Value (Scope Total):</td>
                        <td className="px-4 py-3 text-right font-bold text-amber-700">₹{summary.scope_total?.toLocaleString()}</td>
                        <td colSpan={canManage ? 3 : 2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== PROJECT STAGES TAB ==================== */}
            <TabsContent value="project-stages" className="p-3 sm:p-6">
              <div className="space-y-6" data-testid="project-stages-tab">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold">Project Stages</h3>
                    <p className="text-xs sm:text-sm text-gray-500">Track construction stages and milestones</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {projectStages.length > 0 && (
                      <div className="flex border rounded-lg overflow-hidden" data-testid="stages-view-toggle">
                        <button className={`px-3 py-1.5 text-xs font-medium transition-colors ${stagesView === 'table' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`} onClick={() => setStagesView('table')}>Table</button>
                        <button className={`px-3 py-1.5 text-xs font-medium transition-colors ${stagesView === 'gantt' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`} onClick={() => setStagesView('gantt')} data-testid="gantt-view-btn">Gantt</button>
                      </div>
                    )}
                    {!showAddStages && canManage && (
                      <Button data-testid="add-stages-btn" className="gap-2 bg-secondary hover:bg-secondary/90" onClick={() => setShowAddStages(true)}>
                        <Plus className="h-4 w-4" /> Add Stages
                      </Button>
                    )}
                  </div>
                </div>

                {/* Template Selector */}
                {showAddStages && (
                  <Card className="border-2 border-blue-200 bg-blue-50/30">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <h4 className="font-semibold text-blue-800">Add Project Stages</h4>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">Load Template:</span>
                          <select 
                            className="border rounded-lg px-3 py-1.5 text-sm bg-white"
                            value={selectedTemplate}
                            onChange={(e) => handleLoadTemplate(e.target.value)}
                            data-testid="template-selector"
                          >
                            <option value="">-- Select Template --</option>
                            {stageTemplates.map(t => (
                              <option key={t.template_id || t.template_name} value={t.template_name}>{t.template_name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Stage Rows */}
                      <div className="space-y-2">
                        {newStages.map((stage, idx) => (
                          <div key={idx} className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-lg border" data-testid={`new-stage-row-${idx}`}>
                            <span className="text-sm font-medium text-gray-500 w-6">{idx + 1}.</span>
                            <input
                              type="text"
                              placeholder="Stage name"
                              className="flex-1 min-w-[150px] border rounded-lg px-3 py-1.5 text-sm"
                              value={stage.stage_name}
                              onChange={(e) => updateNewStage(idx, 'stage_name', e.target.value)}
                              data-testid={`stage-name-input-${idx}`}
                            />
                            <div className="flex items-center gap-1">
                              <label className="text-[10px] text-gray-400">Start</label>
                              <input
                                type="date"
                                className="border rounded-lg px-2 py-1.5 text-sm"
                                value={stage.start_date}
                                onChange={(e) => updateNewStage(idx, 'start_date', e.target.value)}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <label className="text-[10px] text-gray-400">End</label>
                              <input
                                type="date"
                                className="border rounded-lg px-2 py-1.5 text-sm"
                                value={stage.target_date}
                                onChange={(e) => updateNewStage(idx, 'target_date', e.target.value)}
                              />
                            </div>
                            <select
                              className={`border rounded-lg px-3 py-1.5 text-sm ${stageStatusConfig[stage.status]?.color || ''}`}
                              value={stage.status}
                              onChange={(e) => updateNewStage(idx, 'status', e.target.value)}
                            >
                              <option value="yet_to_start">Yet to Start</option>
                              <option value="started">Started</option>
                              <option value="finished">Finished</option>
                            </select>
                            <input
                              type="text"
                              placeholder="Remarks"
                              className="flex-1 min-w-[100px] border rounded-lg px-3 py-1.5 text-sm"
                              value={stage.remarks}
                              onChange={(e) => updateNewStage(idx, 'remarks', e.target.value)}
                            />
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeNewStageRow(idx)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      {/* Add row + Action buttons */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={addNewStageRow} data-testid="add-stage-row-btn">
                          <Plus className="h-3 w-3 mr-1" /> Add Row
                        </Button>
                        <div className="flex-1" />
                        <Button variant="outline" size="sm" onClick={() => { setSaveTemplateDialog(true); }} data-testid="save-as-template-btn">
                          <Save className="h-3 w-3 mr-1" /> Save as Template
                        </Button>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleSaveStages} data-testid="save-stages-btn">
                          <Check className="h-3 w-3 mr-1" /> Save Stages
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setShowAddStages(false); setNewStages([{ stage_name: '', start_date: '', target_date: '', status: 'yet_to_start', remarks: '' }]); }}>
                          Cancel
                        </Button>
                      </div>

                      {/* Save as Template Dialog */}
                      {saveTemplateDialog && (
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-sm font-medium text-amber-800 mb-2">Save as Template (e.g., G+1, G+2)</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Template name (e.g., G+2)"
                              className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                              value={templateName}
                              onChange={(e) => setTemplateName(e.target.value)}
                              data-testid="template-name-input"
                            />
                            <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={handleSaveAsTemplate} data-testid="confirm-save-template-btn">
                              Save Template
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setSaveTemplateDialog(false)}>Cancel</Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Existing Stages - Table or Gantt View */}
                {projectStages.length > 0 ? (
                  stagesView === 'gantt' ? (
                    <GanttChart stages={projectStages} />
                  ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Stage Name</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Start Date</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Target Date</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                          {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {projectStages.map((stage, idx) => (
                          <tr key={stage.stage_id} className="hover:bg-gray-50" data-testid={`project-stage-row-${stage.stage_id}`}>
                            <td className="px-4 py-3 text-sm font-medium">{idx + 1}</td>
                            <td className="px-4 py-3">
                              {editingStageId === stage.stage_id ? (
                                <input className="border rounded px-2 py-1 text-sm w-full" value={editStageData.stage_name || ''} onChange={e => setEditStageData(d => ({...d, stage_name: e.target.value}))} />
                              ) : (
                                <span className="font-medium">{stage.stage_name}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {editingStageId === stage.stage_id ? (
                                <input type="date" className="border rounded px-2 py-1 text-sm" value={editStageData.start_date || ''} onChange={e => setEditStageData(d => ({...d, start_date: e.target.value}))} />
                              ) : (
                                <span className="text-sm">{stage.start_date ? new Date(stage.start_date).toLocaleDateString('en-IN') : '-'}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {editingStageId === stage.stage_id ? (
                                <input type="date" className="border rounded px-2 py-1 text-sm" value={editStageData.target_date || ''} onChange={e => setEditStageData(d => ({...d, target_date: e.target.value}))} />
                              ) : (
                                <span className="text-sm">{stage.target_date ? new Date(stage.target_date).toLocaleDateString('en-IN') : '-'}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {editingStageId === stage.stage_id ? (
                                <select className="border rounded px-2 py-1 text-sm" value={editStageData.status || 'yet_to_start'} onChange={e => setEditStageData(d => ({...d, status: e.target.value}))}>
                                  <option value="yet_to_start">Yet to Start</option>
                                  <option value="started">Started</option>
                                  <option value="finished">Finished</option>
                                </select>
                              ) : (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${stageStatusConfig[stage.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                                  {stage.status === 'finished' && <Check className="h-3 w-3 mr-1" />}
                                  {stageStatusConfig[stage.status]?.label || stage.status}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {editingStageId === stage.stage_id ? (
                                <input className="border rounded px-2 py-1 text-sm w-full" value={editStageData.remarks || ''} onChange={e => setEditStageData(d => ({...d, remarks: e.target.value}))} />
                              ) : (
                                stage.remarks || '-'
                              )}
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                {editingStageId === stage.stage_id ? (
                                  <div className="flex justify-center gap-1">
                                    <Button size="sm" variant="outline" className="h-7 text-green-600" onClick={() => handleUpdateStage(stage.stage_id)}><Check className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="outline" className="h-7" onClick={() => setEditingStageId(null)}><X className="h-3 w-3" /></Button>
                                  </div>
                                ) : (
                                  <div className="flex justify-center gap-1">
                                    <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditingStageId(stage.stage_id); setEditStageData({ stage_name: stage.stage_name, start_date: stage.start_date || '', target_date: stage.target_date || '', status: stage.status, remarks: stage.remarks || '' }); }}>
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => handleDeleteStage(stage.stage_id)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )
                ) : !showAddStages && (
                  <div className="text-center py-12 text-gray-500">
                    <Folder className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No project stages defined</p>
                    <p className="text-sm mt-1">Click "Add Stages" to create stages or load from a template</p>
                  </div>
                )}

                {/* Progress Summary */}
                {projectStages.length > 0 && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3 text-center border">
                      <p className="text-2xl font-bold text-gray-600">{projectStages.filter(s => s.status === 'yet_to_start').length}</p>
                      <p className="text-xs text-gray-500">Yet to Start</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                      <p className="text-2xl font-bold text-amber-600">{projectStages.filter(s => s.status === 'started').length}</p>
                      <p className="text-xs text-amber-600">In Progress</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                      <p className="text-2xl font-bold text-green-600">{projectStages.filter(s => s.status === 'finished').length}</p>
                      <p className="text-xs text-green-600">Finished</p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
            {/* ==================== PAYMENTS TAB ==================== */}
            <TabsContent value="payments" className="p-6">
              {/* Balance Payment Info */}
              {(() => {
                const totalValue = summary?.scope_total || projectData?.project?.total_value || 0;
                const advanceReceived = projectData?.project?.advance_amount || 0;
                const balanceForStages = totalValue - advanceReceived;
                const existingStagesTotal = payment_stages.reduce((sum, s) => sum + (s.amount || 0), 0);
                const remainingToAllocate = balanceForStages - existingStagesTotal;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6" data-testid="payment-balance-info">
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                      <p className="text-xs text-blue-600">Total Project Value</p>
                      <p className="text-lg font-bold text-blue-700">₹{totalValue.toLocaleString()}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                      <p className="text-xs text-green-600">Advance Received</p>
                      <p className="text-lg font-bold text-green-700">₹{advanceReceived.toLocaleString()}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                      <p className="text-xs text-amber-600">Balance for Payment Stages</p>
                      <p className="text-lg font-bold text-amber-700">₹{balanceForStages.toLocaleString()}</p>
                    </div>
                    <div className={`rounded-lg p-3 border ${remainingToAllocate > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                      <p className="text-xs text-gray-600">Remaining to Allocate</p>
                      <p className={`text-lg font-bold ${remainingToAllocate > 0 ? 'text-red-600' : 'text-green-600'}`}>₹{remainingToAllocate.toLocaleString()}</p>
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h3 className="text-lg font-bold">Payment Schedule</h3>
                  <p className="text-sm text-gray-500">Milestone payments based on balance after advance (₹{((summary?.scope_total || projectData?.project?.total_value || 0) - (projectData?.project?.advance_amount || 0)).toLocaleString()})</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedPaymentIds.length > 0 && (
                    <Button 
                      data-testid="bulk-delete-payment-btn"
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                      onClick={handleBulkDeletePayment}
                    >
                      <Trash2 className="h-4 w-4" />Delete Selected ({selectedPaymentIds.length})
                    </Button>
                  )}
                  {canManage && (
                    <Dialog open={bulkPaymentDialog} onOpenChange={setBulkPaymentDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-payment-btn" className="gap-2 bg-secondary hover:bg-secondary/90">
                          <Plus className="h-4 w-4" />Add Payments
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Add Multiple Payment Stages</DialogTitle>
                          <DialogDescription>Fill in the rows below (empty rows will be skipped). Balance for stages: ₹{((summary?.scope_total || projectData?.project?.total_value || 0) - (projectData?.project?.advance_amount || 0)).toLocaleString()}</DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">Stage Name *</th>
                                <th className="px-2 py-2 text-left w-20">%</th>
                                <th className="px-2 py-2 text-left w-28">Amount (₹) *</th>
                                <th className="px-2 py-2 text-left">Due Date</th>
                                <th className="px-2 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkPaymentRows.map((row, idx) => (
                                <tr key={idx} className="border-b hover:bg-gray-50">
                                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.stage_name}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        newRows[idx].stage_name = e.target.value;
                                        setBulkPaymentRows(newRows);
                                      }}
                                      placeholder="e.g., Advance"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="number"
                                      value={row.percentage}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        const pct = parseFloat(e.target.value) || 0;
                                        newRows[idx].percentage = e.target.value;
                                        // Auto-calculate amount from percentage of BALANCE (Total - Advance)
                                        const balance = (summary?.scope_total || projectData?.project?.total_value || 0) - (projectData?.project?.advance_amount || 0);
                                        if (balance > 0 && pct > 0) {
                                          newRows[idx].amount = Math.round((balance * pct) / 100);
                                        }
                                        setBulkPaymentRows(newRows);
                                      }}
                                      placeholder="%"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="number"
                                      value={row.amount}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        const amt = parseFloat(e.target.value) || 0;
                                        newRows[idx].amount = e.target.value;
                                        // Auto-calculate percentage from amount based on BALANCE
                                        const balance = (summary?.scope_total || projectData?.project?.total_value || 0) - (projectData?.project?.advance_amount || 0);
                                        if (balance > 0 && amt > 0) {
                                          newRows[idx].percentage = ((amt / balance) * 100).toFixed(2);
                                        }
                                        setBulkPaymentRows(newRows);
                                      }}
                                      placeholder="₹"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="date"
                                      value={row.due_date}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        newRows[idx].due_date = e.target.value;
                                        setBulkPaymentRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    {bulkPaymentRows.length > 1 && (
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => {
                                          const newRows = bulkPaymentRows.filter((_, i) => i !== idx);
                                          setBulkPaymentRows(newRows);
                                        }}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <div className="flex gap-2">
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkPaymentRows([...bulkPaymentRows, { stage_name: '', percentage: '', amount: '', due_date: '' }])}
                            >
                              <Plus className="h-4 w-4 mr-1" /> Add Row
                            </Button>
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkPaymentRows([...bulkPaymentRows, ...createEmptyRows('payment', 5)])}
                            >
                              + Add 5 Rows
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkPaymentDialog(false)}>Cancel</Button>
                            <Button data-testid="submit-bulk-payment-btn" onClick={handleBulkAddPayment}>Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              {/* Edit Payment Stage Dialog */}
              <Dialog open={editPaymentDialog} onOpenChange={setEditPaymentDialog}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Payment Stage</DialogTitle>
                    <DialogDescription>
                      Update payment stage details. Enter percentage or amount - the other will auto-calculate.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-stage-name">Stage Name</Label>
                      <Input
                        id="edit-stage-name"
                        data-testid="edit-payment-stage-name"
                        value={editPaymentForm.stage_name}
                        onChange={(e) => setEditPaymentForm({ ...editPaymentForm, stage_name: e.target.value })}
                        placeholder="e.g., Foundation Payment"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-percentage">Percentage (%)</Label>
                        <Input
                          id="edit-percentage"
                          data-testid="edit-payment-percentage"
                          type="number"
                          value={editPaymentForm.percentage}
                          onChange={(e) => {
                            const pct = parseFloat(e.target.value) || 0;
                            let newAmount = editPaymentForm.amount;
                            const balance = (summary?.scope_total || projectData?.project?.total_value || 0) - (projectData?.project?.advance_amount || 0);
                            if (balance > 0 && pct > 0) {
                              newAmount = Math.round((balance * pct) / 100).toString();
                            }
                            setEditPaymentForm({ ...editPaymentForm, percentage: e.target.value, amount: newAmount });
                          }}
                          placeholder="e.g., 10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-amount">Amount (₹)</Label>
                        <Input
                          id="edit-amount"
                          data-testid="edit-payment-amount"
                          type="number"
                          value={editPaymentForm.amount}
                          onChange={(e) => {
                            const amt = parseFloat(e.target.value) || 0;
                            let newPct = editPaymentForm.percentage;
                            const balance = (summary?.scope_total || projectData?.project?.total_value || 0) - (projectData?.project?.advance_amount || 0);
                            if (balance > 0 && amt > 0) {
                              newPct = ((amt / balance) * 100).toFixed(2);
                            }
                            setEditPaymentForm({ ...editPaymentForm, amount: e.target.value, percentage: newPct });
                          }}
                          placeholder="e.g., 100000"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-due-date">Due Date</Label>
                      <Input
                        id="edit-due-date"
                        data-testid="edit-payment-due-date"
                        type="date"
                        value={editPaymentForm.due_date}
                        onChange={(e) => setEditPaymentForm({ ...editPaymentForm, due_date: e.target.value })}
                      />
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                      <p>Project Total Value: <span className="font-semibold">₹{projectData?.summary?.total_value?.toLocaleString() || 0}</span></p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditPaymentDialog(false)}>Cancel</Button>
                    <Button data-testid="save-payment-edit-btn" onClick={handleSavePaymentEdit}>Save Changes</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {canManage && (
                        <th className="px-3 py-3 text-center w-10">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 h-4 w-4 cursor-pointer"
                            checked={payment_stages.length > 0 && selectedPaymentIds.length === payment_stages.length}
                            onChange={toggleAllPayment}
                            data-testid="select-all-payment"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Stage</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">%</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Received</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {payment_stages.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 10 : 8} className="px-4 py-8 text-center text-gray-500">
                          No payment stages defined yet. Click "Add Payments" to define milestones.
                        </td>
                      </tr>
                    ) : (
                      payment_stages.map((stage, index) => {
                        const balance = stage.amount - (stage.amount_received || 0);
                        const isPaid = balance <= 0;
                        const isRequested = stage.workflow_status === 'requested' || stage.workflow_status === 'pending_collection';
                        const isPartial = stage.amount_received > 0 && balance > 0;
                        
                        // Determine status badge
                        let statusBadge;
                        if (isPaid) {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Collected</span>;
                        } else if (isPartial) {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Partially Collected</span>;
                        } else if (isRequested) {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Requested</span>;
                        } else {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Pending</span>;
                        }
                        
                        return (
                          <tr key={stage.stage_id} data-testid={`payment-row-${stage.stage_id}`} className={`hover:bg-gray-50 ${isPaid ? 'bg-green-50' : ''} ${selectedPaymentIds.includes(stage.stage_id) ? 'bg-blue-50' : ''}`}>
                            {canManage && (
                              <td className="px-3 py-3 text-center">
                                <input 
                                  type="checkbox" 
                                  className="rounded border-gray-300 h-4 w-4 cursor-pointer"
                                  checked={selectedPaymentIds.includes(stage.stage_id)}
                                  onChange={() => togglePaymentSelect(stage.stage_id)}
                                  data-testid={`select-payment-${stage.stage_id}`}
                                />
                              </td>
                            )}
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{stage.stage_name}</p>
                              {stage.due_date && (
                                <p className="text-xs text-gray-500">Due: {new Date(stage.due_date).toLocaleDateString('en-IN')}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">{stage.percentage}%</td>
                            <td className="px-4 py-3 text-right font-semibold">₹{stage.amount?.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-green-600 font-semibold">₹{(stage.amount_received || 0).toLocaleString()}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={balance > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                                ₹{balance.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {statusBadge}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {/* Request Payment - for Planning/Admin, only if draft and balance > 0 */}
                                {canManage && balance > 0 && (
                                  <Button
                                    data-testid={`req-payment-${stage.stage_id}`}
                                    variant="outline"
                                    size="sm"
                                    className="text-amber-600 border-blue-300 hover:bg-amber-50"
                                    onClick={() => handleRequestPayment(stage.stage_id)}
                                  >
                                    <Send className="h-3 w-3 mr-1" />
                                    Req Payment
                                  </Button>
                                )}
                                {/* Request Balance - for partially collected */}
                                {canManage && isPartial && !isRequested && (
                                  <Button
                                    data-testid={`req-balance-${stage.stage_id}`}
                                    variant="outline"
                                    size="sm"
                                    className="text-orange-600 border-orange-300 hover:bg-orange-50"
                                    onClick={() => handleRequestPayment(stage.stage_id)}
                                  >
                                    <Send className="h-3 w-3 mr-1" />
                                    Req Balance
                                  </Button>
                                )}
                                {/* Edit button - only for draft items that are not paid */}
                                {canManage && !isPaid && (
                                  <Button
                                    data-testid={`edit-payment-${stage.stage_id}`}
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditPaymentDialog(stage)}
                                    title="Edit payment stage"
                                  >
                                    <Edit className="h-4 w-4 text-amber-600" />
                                  </Button>
                                )}
                                {/* Delete button - only for draft items that are not paid */}
                                {canManage && !isPaid && (
                                  <Button 
                                    data-testid={`delete-payment-${stage.stage_id}`}
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleDeletePayment(stage.stage_id)}
                                    title="Delete payment stage"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                )}
                                {/* Done badge */}
                                {isPaid && (
                                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {payment_stages.length > 0 && (
                    <tfoot className="bg-green-50 border-t-2">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-right font-bold">Totals:</td>
                        <td className="px-4 py-3 text-right font-bold">₹{(summary.payment_schedule_total || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">₹{(summary.payment_received || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">₹{((summary.payment_schedule_total || 0) - (summary.payment_received || 0)).toLocaleString()}</td>
                        <td colSpan={canManage ? 2 : 1}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== ADDITIONS TAB ==================== */}
            <TabsContent value="additions" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Additional Work</h3>
                  <p className="text-sm text-gray-500">Track extra work and variations</p>
                </div>
                <div className="flex gap-2">
                  {canManage && (
                    <Dialog open={bulkAdditionDialog} onOpenChange={setBulkAdditionDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-addition-btn" className="gap-2 bg-secondary hover:bg-secondary/90">
                          <Plus className="h-4 w-4" />Add Additions
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Add Multiple Additions</DialogTitle>
                          <DialogDescription>Fill in the rows below (empty rows will be skipped)</DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">Description *</th>
                                <th className="px-2 py-2 text-left w-32">Amount (₹) *</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkAdditionRows.map((row, idx) => (
                                <tr key={idx} className="border-b">
                                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.description}
                                      onChange={(e) => {
                                        const newRows = [...bulkAdditionRows];
                                        newRows[idx].description = e.target.value;
                                        setBulkAdditionRows(newRows);
                                      }}
                                      placeholder="e.g., Extra flooring"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="number"
                                      value={row.estimated_amount}
                                      onChange={(e) => {
                                        const newRows = [...bulkAdditionRows];
                                        newRows[idx].estimated_amount = e.target.value;
                                        setBulkAdditionRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center">
                          <Button type="button" variant="outline" onClick={() => setBulkAdditionRows([...bulkAdditionRows, ...createEmptyRows('addition', 5)])}>
                            + Add More Rows
                          </Button>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkAdditionDialog(false)}>Cancel</Button>
                            <Button onClick={handleBulkAddAddition}>Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Work Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Income</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {additional_costs.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                          No additions recorded yet. Click "Add Additions" for extra work.
                        </td>
                      </tr>
                    ) : (
                      additional_costs.map((cost, index) => {
                        const balance = cost.estimated_amount - (cost.income_received || 0);
                        const isEditing = editingAddition === cost.cost_id;
                        
                        return (
                          <tr key={cost.cost_id} data-testid={`addition-row-${cost.cost_id}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">{cost.description}</td>
                            <td className="px-4 py-3 text-right font-semibold">₹{cost.estimated_amount?.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  className="w-28 text-right"
                                  defaultValue={cost.income_received}
                                  onBlur={(e) => handleUpdateAddition(cost.cost_id, { income_received: parseFloat(e.target.value) || 0 })}
                                  autoFocus
                                />
                              ) : (
                                <span className="text-green-600">₹{(cost.income_received || 0).toLocaleString()}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={balance > 0 ? 'text-red-600' : 'text-green-600'}>
                                ₹{balance.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <WorkflowBadge status={cost.workflow_status || 'draft'} />
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {balance > 0 && !cost.payment_requested && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 gap-1 border-green-500 text-green-700 hover:bg-green-50 text-xs"
                                      onClick={() => handleRequestAdditionPayment(cost.cost_id)}
                                      data-testid={`req-payment-addition-${cost.cost_id}`}
                                    >
                                      <Send className="h-3 w-3" /> Req Payment
                                    </Button>
                                  )}
                                  {cost.payment_requested && balance > 0 && (
                                    <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">Requested</span>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setEditingAddition(isEditing ? null : cost.cost_id)}
                                  >
                                    {isEditing ? <Save className="h-4 w-4 text-green-500" /> : <Edit className="h-4 w-4 text-amber-600" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDeleteAddition(cost.cost_id)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {additional_costs.length > 0 && (
                    <tfoot className="bg-cyan-50 border-t-2">
                      <tr>
                        <td colSpan="2" className="px-4 py-3 text-right font-bold">Totals:</td>
                        <td className="px-4 py-3 text-right font-bold">₹{summary.additions_total?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">₹{summary.additions_received?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">₹{(summary.additions_total - summary.additions_received)?.toLocaleString()}</td>
                        <td colSpan={canManage ? 2 : 1}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== DEDUCTIONS TAB ==================== */}
            <TabsContent value="deductions" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Deductions</h3>
                  <p className="text-sm text-gray-500">Track penalties, discounts, and adjustments</p>
                </div>
                <div className="flex gap-2">
                  {canManage && (
                    <Dialog open={bulkDeductionDialog} onOpenChange={setBulkDeductionDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-deduction-btn" className="gap-2 bg-orange-600 hover:bg-orange-700">
                          <MinusCircle className="h-4 w-4" />Add Deductions
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Add Multiple Deductions</DialogTitle>
                          <DialogDescription>Fill in the rows below (empty rows will be skipped)</DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">Description *</th>
                                <th className="px-2 py-2 text-left w-32">Amount (₹) *</th>
                                <th className="px-2 py-2 text-left">Remarks</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkDeductionRows.map((row, idx) => (
                                <tr key={idx} className="border-b">
                                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.description}
                                      onChange={(e) => {
                                        const newRows = [...bulkDeductionRows];
                                        newRows[idx].description = e.target.value;
                                        setBulkDeductionRows(newRows);
                                      }}
                                      placeholder="e.g., Penalty"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="number"
                                      value={row.amount}
                                      onChange={(e) => {
                                        const newRows = [...bulkDeductionRows];
                                        newRows[idx].amount = e.target.value;
                                        setBulkDeductionRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.remarks}
                                      onChange={(e) => {
                                        const newRows = [...bulkDeductionRows];
                                        newRows[idx].remarks = e.target.value;
                                        setBulkDeductionRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center">
                          <Button type="button" variant="outline" onClick={() => setBulkDeductionRows([...bulkDeductionRows, ...createEmptyRows('deduction', 5)])}>
                            + Add More Rows
                          </Button>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkDeductionDialog(false)}>Cancel</Button>
                            <Button onClick={handleBulkAddDeduction} className="bg-orange-600 hover:bg-orange-700">Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {deductions.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 6 : 5} className="px-4 py-8 text-center text-gray-500">
                          No deductions recorded yet. Click "Add Deductions" for penalties or adjustments.
                        </td>
                      </tr>
                    ) : (
                      deductions.map((d, index) => (
                        <tr key={d.deduction_id} data-testid={`deduction-row-${d.deduction_id}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{index + 1}</td>
                          <td className="px-4 py-3 font-medium">{d.description}</td>
                          <td className="px-4 py-3 text-right font-semibold text-orange-600">-₹{d.amount?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            <WorkflowBadge status={d.workflow_status || 'draft'} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{d.remarks || '-'}</td>
                          {canManage && (
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteDeduction(d.deduction_id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                  {deductions.length > 0 && (
                    <tfoot className="bg-orange-50 border-t-2">
                      <tr>
                        <td colSpan="2" className="px-4 py-3 text-right font-bold">Total Deductions:</td>
                        <td className="px-4 py-3 text-right font-bold text-orange-700">-₹{summary.deductions_total?.toLocaleString()}</td>
                        <td colSpan={canManage ? 3 : 2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== PAYMENT SUMMARY TAB ==================== */}
            <TabsContent value="payment-summary" className="p-3 sm:p-6">
              <PaymentSummarySection
                user={user}
                projectId={projectId}
                paymentSummary={paymentSummary}
                formatCurrency={formatCurrency}
                handleGenerateSchedule={handleGenerateSchedule}
                getPaymentStatusBadge={getPaymentStatusBadge}
                openCollectDialog={openCollectDialog}
              />

              {/* Advance Payment Card */}
            </TabsContent>



            {/* ==================== DOCUMENTS TAB ==================== */}
            <TabsContent value="documents" className="p-3 sm:p-6">
              <div className="space-y-6">

                {/* Architect Design Data - FIRST */}
                {(designData.site_plans.length > 0 || designData.design_files.length > 0) && (
                  <div className="space-y-4">
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <Layers className="h-5 w-5 text-indigo-600" />
                      Architect Designs
                    </h3>

                    {/* Site Plans */}
                    {designData.site_plans.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-2">Site Plans ({designData.site_plans.length})</p>
                        <div className="overflow-x-auto border rounded-lg">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Floor</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Status</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Drive Link</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Remarks</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {designData.site_plans.map(plan => (
                                <tr key={plan.plan_id} className="hover:bg-gray-50" data-testid={`doc-site-plan-${plan.plan_id}`}>
                                  <td className="px-3 py-2 font-medium">{plan.floor_name}</td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                      plan.status === 'approved' ? 'bg-green-100 text-green-700 border-green-300' :
                                      plan.status === 'approval_waiting' ? 'bg-amber-100 text-amber-700 border-amber-300' :
                                      plan.status === 'design' ? 'bg-blue-100 text-blue-700 border-blue-300' :
                                      'bg-gray-100 text-gray-700 border-gray-300'
                                    }`}>
                                      {plan.status === 'yet_to_start' ? 'Yet to Start' : plan.status === 'approval_waiting' ? 'Approval Waiting' : plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {plan.drive_link ? <a href={plan.drive_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">Open</a> : '-'}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-500">{plan.remarks || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Design Files (3D + Elevations) */}
                    {designData.design_files.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-2">3D Photos & Elevations ({designData.design_files.length})</p>
                        <div className="grid gap-2">
                          {designData.design_files.map(file => (
                            <div key={file.file_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border" data-testid={`doc-design-file-${file.file_id}`}>
                              <div>
                                <p className="font-medium text-sm">{file.file_name}</p>
                                <p className="text-xs text-gray-400">{file.file_type === '3d_photo' ? '3D Photo' : 'Elevation'} {file.remarks ? `- ${file.remarks}` : ''}</p>
                              </div>
                              {file.drive_link && (
                                <a href={file.drive_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs border border-blue-200 rounded px-2 py-1">
                                  Open Drive
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Project Documents - compact with upload button */}
                <div className={designData.site_plans.length > 0 || designData.design_files.length > 0 ? 'pt-4 border-t' : ''}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <Folder className="h-5 w-5 text-amber-600" />
                      Project Documents
                      <Badge variant="outline" className="ml-1">{projectFiles.length}</Badge>
                    </h3>
                    <FileUpload
                      projectId={projectId}
                      category="project-documents"
                      onUploadComplete={fetchProjectFiles}
                      compact
                    />
                  </div>

                  <FileList
                    files={projectFiles}
                    onDelete={fetchProjectFiles}
                    canDelete={user && ['super_admin', 'planning', 'project_manager'].includes(user.role)}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* Verification Dialog */}
      <Dialog open={verifyDialog.open} onOpenChange={(open) => !open && setVerifyDialog({ open: false, type: '', ids: [] })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Verify Items
            </DialogTitle>
            <DialogDescription>
              You are about to verify {verifyDialog.ids.length} {verifyDialog.type} item(s) and send them for Super Admin approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Important:</strong> Please review all items carefully before verification. 
                Once verified, items will be sent to the Super Admin for final approval.
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">
                Type <span className="font-bold text-amber-600">VERIFY</span> to confirm
              </Label>
              <Input
                data-testid="verify-code-input"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="Type VERIFY"
                className="mt-2"
              />
              {verifyCode && verifyCode !== 'VERIFY' && (
                <p className="text-xs text-red-500 mt-1">Please type 'VERIFY' exactly in capital letters</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialog({ open: false, type: '', ids: [] })}>
              Cancel
            </Button>
            <Button 
              data-testid="confirm-verify-btn"
              onClick={handleVerify}
              disabled={verifyCode !== 'VERIFY'}
              className="gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              Verify & Send for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Collect Payment Dialog */}
      <Dialog open={collectPaymentDialog} onOpenChange={setCollectPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Collect Payment
            </DialogTitle>
            <DialogDescription>
              {selectedStage?.stage_label} - {selectedStage?.stage_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg">
              <div>
                <p className="text-xs text-gray-500">Stage Amount</p>
                <p className="font-semibold">{formatCurrency(selectedStage?.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Already Received</p>
                <p className="font-semibold text-green-600">{formatCurrency(selectedStage?.amount_received || 0)}</p>
              </div>
            </div>
            
            <div>
              <Label>Amount to Collect *</Label>
              <Input
                type="number"
                value={collectForm.amount_received}
                onChange={(e) => setCollectForm({...collectForm, amount_received: e.target.value})}
                placeholder="Enter amount"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Payment Mode *</Label>
              <select
                value={collectForm.payment_mode}
                onChange={(e) => setCollectForm({...collectForm, payment_mode: e.target.value})}
                className="w-full mt-1 p-2 border rounded-md"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            
            <div>
              <Label>Reference / Transaction ID</Label>
              <Input
                value={collectForm.payment_reference}
                onChange={(e) => setCollectForm({...collectForm, payment_reference: e.target.value})}
                placeholder="Transaction ID or Cheque No."
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Remarks</Label>
              <Input
                value={collectForm.remarks}
                onChange={(e) => setCollectForm({...collectForm, remarks: e.target.value})}
                placeholder="Optional remarks"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectPaymentDialog(false)}>Cancel</Button>
            <Button onClick={handleCollectPayment} className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirm Collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
