import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { 
  Target, LogOut, Search, Phone, Mail, MapPin, ArrowRight, RefreshCw, 
  GripVertical, Eye, FileText, CheckCircle, XCircle, Clock, TrendingUp,
  Building2, Calculator, Download, LayoutGrid, List
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Company Details
const COMPANY_INFO = {
  name: 'URBAN SPACE BUILDERS',
  tagline: 'Building Dreams Into Reality',
  address: 'No.123, Construction Lane, Chennai - 600001',
  phone: '+91 44 2345 6789',
  email: 'info@urbanspacebuilders.com',
  website: 'www.urbanspacebuilders.com',
  gstin: 'GSTIN: 33XXXXX1234X1Z5'
};

const RE_STATUS_CONFIG = {
  re_requested: { label: 'RE Requested', color: 'bg-blue-100 text-blue-700', icon: Clock },
  re_in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700', icon: RefreshCw },
  re_submitted: { label: 'Submitted', color: 'bg-purple-100 text-purple-700', icon: FileText },
  re_approved: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  re_rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
  deal_closed: { label: 'Deal Closed', color: 'bg-emerald-100 text-emerald-700', icon: Target },
  converted: { label: 'Converted', color: 'bg-teal-100 text-teal-700', icon: Building2 }
};

export default function CRMSales() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' or 'list'
  const [activeStage, setActiveStage] = useState('all');
  
  // Dialogs
  const [viewLeadDialog, setViewLeadDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [reProjectDialog, setReProjectDialog] = useState(false);
  const [selectedREProject, setSelectedREProject] = useState(null);
  
  const [draggedLead, setDraggedLead] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, dashboardRes, stagesRes, leadsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/crm/sales/dashboard`),
        axios.get(`${API}/crm/stages?stage_type=sales`),
        axios.get(`${API}/crm/sales/leads`)
      ]);
      
      setUser(userRes.data);
      setDashboard(dashboardRes.data);
      setStages(stagesRes.data);
      setLeads(leadsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      } else if (error.response?.status === 403) {
        toast.error('Access denied. Sales access required.');
        window.location.href = '/dashboard';
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch (e) {}
    window.location.href = '/login';
  };

  const handleStageChange = async (leadId, newStageId) => {
    try {
      const stage = stages.find(s => s.stage_id === newStageId);
      
      const result = await axios.patch(`${API}/crm/leads/${leadId}/stage`, { stage_id: newStageId });
      
      if (result.data.re_project_created) {
        toast.success('Rough Estimate Project created! Planning team notified.');
      } else if (stage?.name === 'Deal Closed') {
        toast.success('Deal Closed! Sent to CRE for project creation.');
      } else {
        toast.success('Lead stage updated');
      }
      
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update stage');
    }
  };
  const handleViewREProject = async (reProjectId) => {
    try {
      const res = await axios.get(`${API}/crm/re-projects/${reProjectId}`);
      setSelectedREProject(res.data);
      setReProjectDialog(true);
    } catch (error) {
      toast.error('Failed to load RE project');
    }
  };

  // Generate PDF for Rough Estimate
  const generateREPDF = () => {
    if (!selectedREProject) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Add watermark
    doc.setTextColor(240, 240, 240);
    doc.setFontSize(50);
    doc.setFont('helvetica', 'bold');
    const watermarkText = 'URBAN SPACE BUILDERS';
    const watermarkWidth = doc.getTextWidth(watermarkText);
    doc.text(watermarkText, (pageWidth - watermarkWidth) / 2, pageHeight / 2, { angle: 45 });
    
    // Reset text color
    doc.setTextColor(0, 0, 0);
    
    // Company Header
    doc.setFillColor(45, 45, 45);
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    // Company Name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(COMPANY_INFO.name, 14, 18);
    
    // Company Tagline
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(COMPANY_INFO.tagline, 14, 26);
    
    // Company Contact (right side)
    doc.setFontSize(8);
    doc.text(COMPANY_INFO.phone, pageWidth - 14, 14, { align: 'right' });
    doc.text(COMPANY_INFO.email, pageWidth - 14, 20, { align: 'right' });
    doc.text(COMPANY_INFO.website, pageWidth - 14, 26, { align: 'right' });
    doc.text(COMPANY_INFO.address, pageWidth - 14, 32, { align: 'right' });
    
    // Document Title
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('ROUGH ESTIMATE', pageWidth / 2, 55, { align: 'center' });
    
    // Estimate Reference
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Ref: ${selectedREProject.re_project_id}`, pageWidth / 2, 62, { align: 'center' });
    doc.text(`Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, pageWidth / 2, 68, { align: 'center' });
    
    // Client Information Box
    let yPos = 80;
    doc.setFillColor(249, 250, 251);
    doc.rect(14, yPos - 5, pageWidth - 28, 35, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(14, yPos - 5, pageWidth - 28, 35, 'S');
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENT INFORMATION', 18, yPos + 2);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    yPos += 10;
    doc.text(`Name: ${selectedREProject.client_name || '-'}`, 18, yPos);
    doc.text(`Phone: ${selectedREProject.client_phone || '-'}`, pageWidth / 2, yPos);
    yPos += 7;
    doc.text(`Email: ${selectedREProject.client_email || '-'}`, 18, yPos);
    doc.text(`Location: ${selectedREProject.location || '-'}`, pageWidth / 2, yPos);
    
    // Project Details Box
    yPos += 20;
    doc.setFillColor(249, 250, 251);
    doc.rect(14, yPos - 5, pageWidth - 28, 28, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(14, yPos - 5, pageWidth - 28, 28, 'S');
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PROJECT DETAILS', 18, yPos + 2);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    yPos += 10;
    doc.text(`Project Name: ${selectedREProject.project_name || '-'}`, 18, yPos);
    doc.text(`Square Feet: ${selectedREProject.sqft ? `${selectedREProject.sqft} sqft` : '-'}`, pageWidth / 2, yPos);
    yPos += 7;
    doc.text(`Building Type: ${selectedREProject.building_type || '-'}`, 18, yPos);
    doc.text(`Handover: ${selectedREProject.handover_months ? `${selectedREProject.handover_months} months` : '-'}`, pageWidth / 2, yPos);
    
    // Scope of Works Table
    yPos += 20;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('SCOPE OF WORKS', 14, yPos);
    yPos += 5;
    
    const scopeItems = selectedREProject.rough_scope_items || [];
    if (scopeItems.length > 0) {
      const tableData = scopeItems.map((item, idx) => [
        idx + 1,
        item.description || '-',
        item.quantity || '-',
        item.unit || '-',
        formatCurrency(item.rate || 0),
        formatCurrency(item.total || 0)
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [['S.No', 'Description', 'Qty', 'Unit', 'Rate', 'Amount']],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [45, 45, 45],
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: 'bold'
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [50, 50, 50]
        },
        columnStyles: {
          0: { cellWidth: 15, halign: 'center' },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 30, halign: 'right' },
          5: { cellWidth: 35, halign: 'right' }
        },
        margin: { left: 14, right: 14 }
      });
      
      yPos = doc.lastAutoTable.finalY + 10;
    } else {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(150, 150, 150);
      doc.text('No scope items added', 14, yPos + 5);
      yPos += 15;
    }
    
    // Total Amount Box
    const total = selectedREProject.estimated_total || scopeItems.reduce((sum, item) => sum + (item.total || 0), 0);
    
    doc.setFillColor(138, 43, 226);
    doc.rect(pageWidth - 80, yPos, 66, 20, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('ESTIMATED TOTAL', pageWidth - 47, yPos + 7, { align: 'center' });
    doc.setFontSize(14);
    doc.text(formatCurrency(total), pageWidth - 47, yPos + 16, { align: 'center' });
    
    // Planning Notes
    if (selectedREProject.planning_notes) {
      yPos += 30;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', 14, yPos);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const splitNotes = doc.splitTextToSize(selectedREProject.planning_notes, pageWidth - 28);
      doc.text(splitNotes, 14, yPos + 6);
    }
    
    // Footer
    const footerY = pageHeight - 20;
    doc.setDrawColor(200, 200, 200);
    doc.line(14, footerY - 5, pageWidth - 14, footerY - 5);
    
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('This is a rough estimate and subject to change based on site conditions and final specifications.', pageWidth / 2, footerY, { align: 'center' });
    doc.text(COMPANY_INFO.gstin, pageWidth / 2, footerY + 5, { align: 'center' });
    doc.text(`Generated on ${new Date().toLocaleString('en-IN')}`, pageWidth / 2, footerY + 10, { align: 'center' });
    
    // Save PDF
    const fileName = `RE_${selectedREProject.project_name || selectedREProject.client_name}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    toast.success('PDF downloaded successfully!');
  };

  const handleDragStart = (e, lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, stageId) => {
    e.preventDefault();
    if (draggedLead && draggedLead.current_stage_id !== stageId) {
      await handleStageChange(draggedLead.lead_id, stageId);
    }
    setDraggedLead(null);
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !searchQuery || 
      lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone?.includes(searchQuery);
    return matchesSearch;
  });

  const getLeadsByStage = (stageId) => {
    return filteredLeads.filter(lead => lead.current_stage_id === stageId);
  };

  const getStageName = (stageId) => {
    const stage = stages.find(s => s.stage_id === stageId);
    return stage?.name || stageId;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b px-4 py-3 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-full mx-auto">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 rounded-xl shadow-lg">
              <Target className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">CRM - Sales</h1>
              <p className="text-xs text-gray-500">Deal Management & Conversion</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="outline" size="sm" onClick={() => window.location.href = '/crm-pre-sales'}>
              Pre-Sales
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.location.href = '/crm/re-projects'}>
              <FileText className="h-4 w-4 mr-1" /> RE Projects
            </Button>
            <div className="flex items-center gap-2 pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-xs text-gray-500 uppercase">{user?.role?.replace('_', ' ')}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-full mx-auto px-4 py-6 sm:px-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0">
            <CardContent className="p-4">
              <p className="text-emerald-100 text-sm">Total Leads</p>
              <p className="text-3xl font-bold">{dashboard?.total_leads || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-blue-600">RE Requested</span>
              </div>
              <p className="text-2xl font-bold text-blue-700">{dashboard?.re_stats?.requested || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <RefreshCw className="h-4 w-4 text-yellow-600" />
                <span className="text-xs text-yellow-600">RE In Progress</span>
              </div>
              <p className="text-2xl font-bold text-yellow-700">{dashboard?.re_stats?.in_progress || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-xs text-green-600">RE Approved</span>
              </div>
              <p className="text-2xl font-bold text-green-700">{dashboard?.re_stats?.approved || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-teal-50 border-teal-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-teal-600" />
                <span className="text-xs text-teal-600">Converted</span>
              </div>
              <p className="text-2xl font-bold text-teal-700">{dashboard?.re_stats?.converted || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Search + View Toggle */}
        <div className="flex gap-3 mb-6 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="search-input"
            />
          </div>

          {/* View Toggle */}
          <div className="flex items-center border rounded-lg overflow-hidden bg-white ml-auto">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className="rounded-none px-3"
              data-testid="kanban-view-btn"
            >
              <LayoutGrid className="h-4 w-4 mr-1" />
              <span className="text-xs">Kanban</span>
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-none px-3"
              data-testid="list-view-btn"
            >
              <List className="h-4 w-4 mr-1" />
              <span className="text-xs">List</span>
            </Button>
          </div>
        </div>

        {/* List View */}
        {viewMode === 'list' && (
          <div className="bg-white rounded-lg border shadow-sm">
            {/* Stage Tabs */}
            <div className="border-b overflow-x-auto">
              <div className="flex">
                <button
                  className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeStage === 'all' 
                      ? 'border-emerald-500 text-emerald-600 bg-emerald-50' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => setActiveStage('all')}
                >
                  All ({leads.length})
                </button>
                {stages.map(stage => (
                  <button
                    key={stage.stage_id}
                    className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeStage === stage.stage_id 
                        ? 'border-emerald-500 text-emerald-600 bg-emerald-50' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => setActiveStage(stage.stage_id)}
                    style={{ borderBottomColor: activeStage === stage.stage_id ? stage.color : undefined }}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }}></span>
                      {stage.name}
                      <span className="text-gray-400">({getLeadsByStage(stage.stage_id).length})</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* List Table */}
            <div className="w-full">
              <table className="w-full table-fixed">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[22%]">Lead</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[22%]">Contact</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[16%]">Stage</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[14%]">RE Status</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[14%]">Created</th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-[12%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(activeStage === 'all' ? filteredLeads : getLeadsByStage(activeStage)).map(lead => (
                    <tr 
                      key={lead.lead_id} 
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => { setSelectedLead(lead); setViewLeadDialog(true); }}
                    >
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                            {lead.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 text-xs truncate">{lead.name}</p>
                            {lead.custom_fields?.sqft && (
                              <p className="text-[10px] text-gray-500">{lead.custom_fields.sqft} sqft</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="space-y-0 min-w-0">
                          {lead.phone && (
                            <p className="text-xs text-gray-600 truncate">{lead.phone}</p>
                          )}
                          {lead.email && (
                            <p className="text-[10px] text-gray-500 truncate">{lead.email}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <Badge 
                          variant="outline" 
                          className="text-[10px] px-1.5 truncate"
                          style={{ borderColor: stages.find(s => s.stage_id === lead.current_stage_id)?.color }}
                        >
                          {getStageName(lead.current_stage_id)?.substring(0, 12)}
                        </Badge>
                      </td>
                      <td className="px-2 py-2">
                        {lead.re_project_id ? (
                          <Badge 
                            className="bg-purple-100 text-purple-700 text-[10px] px-1.5 cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); handleViewREProject(lead.re_project_id); }}
                          >
                            View RE
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span className="text-xs text-gray-500">
                          {new Date(lead.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); setViewLeadDialog(true); }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(activeStage === 'all' ? filteredLeads : getLeadsByStage(activeStage)).length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-4 py-12 text-center text-gray-500">
                        No leads found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Kanban Board */}
        {viewMode === 'kanban' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {stages.map(stage => (
              <div 
                key={stage.stage_id}
                className="w-80 flex-shrink-0"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage.stage_id)}
              >
                <div 
                  className="rounded-t-lg px-4 py-3 flex items-center justify-between"
                  style={{ backgroundColor: stage.color + '20', borderTop: `3px solid ${stage.color}` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{stage.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {getLeadsByStage(stage.stage_id).length}
                    </Badge>
                  </div>
                  {stage.is_final && (
                    <Badge className={stage.name === 'Lost' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'} style={{ fontSize: '10px' }}>
                      {stage.name === 'Lost' ? 'End' : 'Final'}
                    </Badge>
                  )}
                </div>
                
                <div className="bg-gray-100 rounded-b-lg p-2 min-h-[400px] space-y-2">
                  {getLeadsByStage(stage.stage_id).map(lead => (
                    <Card
                      key={lead.lead_id}
                      className="cursor-grab active:cursor-grabbing hover:shadow-md transition-all"
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead)}
                      data-testid={`lead-card-${lead.lead_id}`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-gray-300" />
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm font-semibold">
                              {lead.name?.charAt(0)?.toUpperCase()}
                            </div>
                          </div>
                          {lead.re_project_id && (
                            <Badge 
                              className="bg-purple-100 text-purple-700 cursor-pointer text-xs"
                              onClick={() => handleViewREProject(lead.re_project_id)}
                            >
                              <FileText className="h-3 w-3 mr-1" /> RE
                            </Badge>
                          )}
                        </div>
                        
                        <h4 className="font-semibold text-gray-900 mb-1">{lead.name}</h4>
                        
                        {lead.phone && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                            <Phone className="h-3 w-3" /> {lead.phone}
                          </p>
                        )}
                        
                        {lead.custom_fields?.sqft && (
                          <p className="text-xs text-gray-500 mb-1">
                            {lead.custom_fields.sqft} sqft • {lead.custom_fields?.project_type || 'Residential'}
                          </p>
                        )}
                        
                        {lead.transferred_from_lead_id && (
                          <Badge className="bg-indigo-100 text-indigo-700 text-xs mt-1">
                            From Pre-Sales
                          </Badge>
                        )}
                        
                        <div className="flex items-center justify-between mt-3 pt-2 border-t">
                          <span className="text-xs text-gray-400">
                            {new Date(lead.created_at).toLocaleDateString()}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => { setSelectedLead(lead); setViewLeadDialog(true); }}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  
                  {getLeadsByStage(stage.stage_id).length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      No leads in this stage
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>

      {/* View Lead Dialog */}
      <Dialog open={viewLeadDialog} onOpenChange={setViewLeadDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold">
                {selectedLead?.name?.charAt(0)?.toUpperCase()}
              </div>
              {selectedLead?.name}
            </DialogTitle>
          </DialogHeader>
          
          {selectedLead && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{getStageName(selectedLead.current_stage_id)}</Badge>
                {selectedLead.re_project_id && (
                  <Badge 
                    className="bg-purple-100 text-purple-700 cursor-pointer"
                    onClick={() => {
                      handleViewREProject(selectedLead.re_project_id);
                      setViewLeadDialog(false);
                    }}
                  >
                    <FileText className="h-3 w-3 mr-1" /> View RE Project
                  </Badge>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {selectedLead.email && (
                  <div>
                    <Label className="text-xs text-gray-500">Email</Label>
                    <p className="text-sm flex items-center gap-1">
                      <Mail className="h-4 w-4 text-gray-400" /> {selectedLead.email}
                    </p>
                  </div>
                )}
                {selectedLead.phone && (
                  <div>
                    <Label className="text-xs text-gray-500">Phone</Label>
                    <p className="text-sm flex items-center gap-1">
                      <Phone className="h-4 w-4 text-gray-400" /> {selectedLead.phone}
                    </p>
                  </div>
                )}
              </div>
              
              {Object.keys(selectedLead.custom_fields || {}).length > 0 && (
                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Details</Label>
                  <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-lg p-3">
                    {Object.entries(selectedLead.custom_fields).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-xs text-gray-500 capitalize">{key.replace('_', ' ')}</span>
                        <p className="text-sm font-medium">{value || '-'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Stage Change */}
              <div className="border-t pt-4">
                <Label className="text-xs text-gray-500 mb-2 block">Move to Stage</Label>
                <div className="flex flex-wrap gap-2">
                  {stages.map(stage => (
                    <Button
                      key={stage.stage_id}
                      variant={selectedLead.current_stage_id === stage.stage_id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        handleStageChange(selectedLead.lead_id, stage.stage_id);
                        setViewLeadDialog(false);
                      }}
                      style={selectedLead.current_stage_id === stage.stage_id ? { backgroundColor: stage.color } : { borderColor: stage.color, color: stage.color }}
                    >
                      {stage.name}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewLeadDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RE Project Dialog */}
      <Dialog open={reProjectDialog} onOpenChange={setReProjectDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-purple-600" />
                Rough Estimate Project
              </div>
              <Button 
                onClick={generateREPDF} 
                className="bg-purple-600 hover:bg-purple-700"
                size="sm"
              >
                <Download className="h-4 w-4 mr-1" /> Download PDF
              </Button>
            </DialogTitle>
            <DialogDescription>
              URBAN SPACE BUILDERS - Rough Estimate Details
            </DialogDescription>
          </DialogHeader>
          
          {selectedREProject && (
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                {RE_STATUS_CONFIG[selectedREProject.status] && (
                  <Badge className={RE_STATUS_CONFIG[selectedREProject.status].color}>
                    {React.createElement(RE_STATUS_CONFIG[selectedREProject.status].icon, { className: "h-3 w-3 mr-1" })}
                    {RE_STATUS_CONFIG[selectedREProject.status].label}
                  </Badge>
                )}
                <span className="text-xs text-gray-400">Ref: {selectedREProject.re_project_id}</span>
              </div>
              
              {/* Client Info */}
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-2">Client Information</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Name:</span>
                      <p className="font-medium">{selectedREProject.client_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Phone:</span>
                      <p>{selectedREProject.client_phone || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <p>{selectedREProject.client_email || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Location:</span>
                      <p>{selectedREProject.location || '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Project Info */}
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-2">Project Details</h4>
                  <div className="grid grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Project Name:</span>
                      <p className="font-medium">{selectedREProject.project_name || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Square Feet:</span>
                      <p>{selectedREProject.sqft ? `${selectedREProject.sqft} sqft` : '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Building Type:</span>
                      <p className="capitalize">{selectedREProject.building_type || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Handover:</span>
                      <p>{selectedREProject.handover_months ? `${selectedREProject.handover_months} months` : '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Full Scope of Works */}
              <Card className="border-purple-200">
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3 text-purple-800">Scope of Works</h4>
                  {selectedREProject.rough_scope_items?.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-100 border-b">
                            <th className="text-left p-2 font-semibold">S.No</th>
                            <th className="text-left p-2 font-semibold">Description</th>
                            <th className="text-center p-2 font-semibold">Qty</th>
                            <th className="text-center p-2 font-semibold">Unit</th>
                            <th className="text-right p-2 font-semibold">Rate</th>
                            <th className="text-right p-2 font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedREProject.rough_scope_items.map((item, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50">
                              <td className="p-2 text-center">{idx + 1}</td>
                              <td className="p-2">{item.description || '-'}</td>
                              <td className="p-2 text-center">{item.quantity || '-'}</td>
                              <td className="p-2 text-center">{item.unit || '-'}</td>
                              <td className="p-2 text-right">{formatCurrency(item.rate || 0)}</td>
                              <td className="p-2 text-right font-medium">{formatCurrency(item.total || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-purple-50">
                            <td colSpan={5} className="p-2 text-right font-bold text-purple-800">Total:</td>
                            <td className="p-2 text-right font-bold text-purple-900 text-lg">
                              {formatCurrency(selectedREProject.rough_scope_items.reduce((sum, item) => sum + (item.total || 0), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-500">
                      <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      No scope items added yet
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {/* Estimated Total Summary */}
              <Card className="bg-gradient-to-r from-purple-600 to-purple-700">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-purple-100">Estimated Total</p>
                  <p className="text-3xl font-bold text-white">
                    {formatCurrency(selectedREProject.estimated_total || selectedREProject.rough_scope_items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0)}
                  </p>
                  {selectedREProject.handover_months && (
                    <p className="text-sm text-purple-200 mt-1">
                      Project Duration: {selectedREProject.handover_months} months
                    </p>
                  )}
                </CardContent>
              </Card>
              
              {/* Planning Notes */}
              {selectedREProject.planning_notes && (
                <Card className="bg-gray-50">
                  <CardContent className="p-4">
                    <h4 className="font-semibold mb-2 text-gray-700">Planning Notes</h4>
                    <p className="text-sm text-gray-600">{selectedREProject.planning_notes}</p>
                  </CardContent>
                </Card>
              )}
              
              {/* GM Rejection Reason */}
              {selectedREProject.gm_rejection_reason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <Label className="text-xs text-red-600">Rejection Reason</Label>
                  <p className="text-sm text-red-700">{selectedREProject.gm_rejection_reason}</p>
                </div>
              )}
              
              {/* Timestamps */}
              <div className="text-xs text-gray-400 flex flex-wrap gap-4">
                <span>Created: {new Date(selectedREProject.created_at).toLocaleString()}</span>
                {selectedREProject.prepared_at && (
                  <span>Prepared: {new Date(selectedREProject.prepared_at).toLocaleString()}</span>
                )}
                {selectedREProject.gm_approved_at && (
                  <span>GM Action: {new Date(selectedREProject.gm_approved_at).toLocaleString()}</span>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setReProjectDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
