import { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, TrendingUp, TrendingDown, DollarSign, Users, FileText, Menu, LogOut, Plus, UserPlus, Truck, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchUser();
    fetchDashboardData();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const userRes = await axios.get(`${API}/auth/me`);
      const userData = userRes.data;
      setUser(userData);

      if (userData.role === 'super_admin') {
        const response = await axios.get(`${API}/dashboards/super-admin`);
        setDashboardData(response.data);
      }

      const projectsRes = await axios.get(`${API}/projects`);
      setProjects(projectsRes.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
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

  if (!user) {
    return <div className=\"flex items-center justify-center min-h-screen\">Loading...</div>;
  }

  return (
    <div className=\"min-h-screen bg-gray-50\">
      {/* Top Navigation */}
      <nav className=\"bg-white border-b border-gray-200 px-6 py-4\">
        <div className=\"flex items-center justify-between\">
          <div className=\"flex items-center gap-3\">
            <div className=\"bg-blue-600 p-2 rounded-lg\">
              <Building2 className=\"h-6 w-6 text-white\" />
            </div>
            <div>
              <h1 className=\"text-xl font-bold text-gray-900\">ConstructionOS</h1>
              <p className=\"text-xs text-gray-500\">Project Management System</p>
            </div>
          </div>
          
          <div className=\"flex items-center gap-4\">
            <Button
              data-testid=\"dashboard-btn\"
              variant=\"ghost\"
              className=\"text-blue-600 font-semibold\"
            >
              Dashboard
            </Button>
            <Button
              data-testid=\"expenses-btn\"
              variant=\"ghost\"
              onClick={() => window.location.href = '/expenses'}
            >
              Overall Expenses
            </Button>
            <div className=\"flex items-center gap-2 pl-4 border-l\">
              <div className=\"text-right\">
                <p className=\"text-sm font-semibold text-gray-900\">{user.name}</p>
                <p className=\"text-xs text-gray-500\">{user.role.replace('_', ' ').toUpperCase()}</p>
              </div>
              <Button
                data-testid=\"logout-btn\"
                variant=\"ghost\"
                size=\"icon\"
                onClick={handleLogout}
              >
                <LogOut className=\"h-5 w-5\" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className=\"max-w-7xl mx-auto px-6 py-8\">
        {/* Page Header */}
        <div className=\"mb-8\">
          <h2 data-testid=\"dashboard-title\" className=\"text-3xl font-bold text-gray-900 mb-2\">
            Dashboard
          </h2>
          <p className=\"text-gray-600\">Overview of all your construction projects</p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className=\"mb-8\">
          <TabsList className=\"bg-white border border-gray-200\">
            <TabsTrigger value=\"overview\">Overview</TabsTrigger>
            <TabsTrigger value=\"revenue\">Revenue</TabsTrigger>
            <TabsTrigger value=\"expenses\">Expenses</TabsTrigger>
            <TabsTrigger value=\"salary\">Salary</TabsTrigger>
            <TabsTrigger value=\"marketing\">Marketing</TabsTrigger>
            <TabsTrigger value=\"rent\">Rent</TabsTrigger>
            <TabsTrigger value=\"profit\">Profit</TabsTrigger>
          </TabsList>

          <TabsContent value=\"overview\" className=\"mt-6\">
            {/* Metric Cards */}
            {user.role === 'super_admin' && dashboardData && (
              <div className=\"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8\">
                <Card data-testid=\"total-revenue-card\" className=\"bg-gradient-to-br from-green-50 to-green-100 border-green-200\">
                  <CardHeader className=\"pb-2\">
                    <CardTitle className=\"text-sm font-medium text-gray-600\">Total Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className=\"flex items-end justify-between\">
                      <div className=\"text-3xl font-bold text-gray-900\">
                        ₹{(dashboardData.total_project_value / 100000).toFixed(1)}L
                      </div>
                      <TrendingUp className=\"h-8 w-8 text-green-600\" />
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid=\"total-expenses-card\" className=\"bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200\">
                  <CardHeader className=\"pb-2\">
                    <CardTitle className=\"text-sm font-medium text-gray-600\">Total Expenses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className=\"flex items-end justify-between\">
                      <div className=\"text-3xl font-bold text-gray-900\">
                        ₹{(dashboardData.total_spent / 100000).toFixed(1)}L
                      </div>
                      <TrendingDown className=\"h-8 w-8 text-orange-600\" />
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid=\"company-expenses-card\" className=\"bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200\">
                  <CardHeader className=\"pb-2\">
                    <CardTitle className=\"text-sm font-medium text-gray-600\">Company Expenses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className=\"flex items-end justify-between\">
                      <div className=\"text-3xl font-bold text-gray-900\">
                        ₹0
                      </div>
                      <FileText className=\"h-8 w-8 text-blue-600\" />
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid=\"net-profit-card\" className=\"bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200\">
                  <CardHeader className=\"pb-2\">
                    <CardTitle className=\"text-sm font-medium text-gray-600\">Net Profit</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className=\"flex items-end justify-between\">
                      <div className=\"text-3xl font-bold text-gray-900\">
                        ₹{(dashboardData.balance / 100000).toFixed(1)}L
                      </div>
                      <DollarSign className=\"h-8 w-8 text-emerald-600\" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Quick Actions */}
            <Card className=\"mb-8\">
              <CardHeader>
                <CardTitle className=\"text-lg font-bold\">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className=\"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4\">
                  <button
                    data-testid=\"quick-new-project\"
                    onClick={() => window.location.href = '/projects'}
                    className=\"flex flex-col items-center justify-center p-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors\"
                  >
                    <Plus className=\"h-8 w-8 mb-2\" />
                    <span className=\"font-semibold\">New Project</span>
                  </button>

                  <button
                    data-testid=\"quick-add-client\"
                    onClick={() => window.location.href = '/users'}
                    className=\"flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors\"
                  >
                    <UserPlus className=\"h-8 w-8 mb-2 text-blue-600\" />
                    <span className=\"font-semibold\">Add Client</span>
                    <span className=\"text-xs text-gray-500 mt-1\">{projects.length} projects</span>
                  </button>

                  <button
                    data-testid=\"quick-add-vendor\"
                    onClick={() => window.location.href = '/procurement'}
                    className=\"flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors\"
                  >
                    <Truck className=\"h-8 w-8 mb-2 text-blue-600\" />
                    <span className=\"font-semibold\">Add Vendor</span>
                    <span className=\"text-xs text-gray-500 mt-1\">Manage suppliers</span>
                  </button>

                  <button
                    data-testid=\"quick-add-employee\"
                    onClick={() => window.location.href = '/users'}
                    className=\"flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors\"
                  >
                    <Briefcase className=\"h-8 w-8 mb-2 text-blue-600\" />
                    <span className=\"font-semibold\">Add Employee</span>
                    <span className=\"text-xs text-gray-500 mt-1\">Team management</span>
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Projects Table */}
            <Card>
              <CardHeader>
                <CardTitle className=\"text-lg font-bold\">All Projects</CardTitle>
              </CardHeader>
              <CardContent className=\"p-0\">
                <div className=\"overflow-x-auto\">
                  <table className=\"w-full\">
                    <thead className=\"bg-gray-50 border-b border-gray-200\">
                      <tr>
                        <th className=\"px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider\">Project Name</th>
                        <th className=\"px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider\">Total Value</th>
                        <th className=\"px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider\">Received</th>
                        <th className=\"px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider\">Spent</th>
                        <th className=\"px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider\">Balance</th>
                        <th className=\"px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider\">Status</th>
                        <th className=\"px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider\">Action</th>
                      </tr>
                    </thead>
                    <tbody className=\"bg-white divide-y divide-gray-200\">
                      {projects.length === 0 ? (
                        <tr>
                          <td colSpan=\"7\" className=\"px-6 py-8 text-center text-gray-500\">
                            No projects found
                          </td>
                        </tr>
                      ) : (
                        projects.map((project) => (
                          <tr
                            key={project.project_id}
                            data-testid={`project-row-${project.project_id}`}
                            className=\"hover:bg-gray-50 transition-colors\"
                          >
                            <td className=\"px-6 py-4\">
                              <div>
                                <div className=\"font-semibold text-gray-900\">{project.name}</div>
                                <div className=\"text-sm text-gray-500\">{project.client_name}</div>
                              </div>
                            </td>
                            <td className=\"px-6 py-4 font-semibold text-gray-900\">
                              ₹{(project.total_value / 100000).toFixed(2)}L
                            </td>
                            <td className=\"px-6 py-4 text-gray-700\">₹0</td>
                            <td className=\"px-6 py-4 text-gray-700\">₹0</td>
                            <td className=\"px-6 py-4 font-semibold text-gray-900\">
                              ₹{(project.total_value / 100000).toFixed(2)}L
                            </td>
                            <td className=\"px-6 py-4\">
                              <Badge 
                                variant={project.status === 'active' ? 'default' : 'secondary'}
                                className=\"capitalize\"
                              >
                                {project.status}
                              </Badge>
                            </td>
                            <td className=\"px-6 py-4\">
                              <Button
                                data-testid={`view-project-${project.project_id}`}
                                variant=\"outline\"
                                size=\"sm\"
                                onClick={() => window.location.href = `/projects/${project.project_id}`}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Other Tabs */}
          <TabsContent value=\"revenue\">
            <Card>
              <CardContent className=\"py-12 text-center\">
                <p className=\"text-gray-500\">Revenue breakdown coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value=\"expenses\">
            <Card>
              <CardContent className=\"py-12 text-center\">
                <p className=\"text-gray-500\">Expense breakdown coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
