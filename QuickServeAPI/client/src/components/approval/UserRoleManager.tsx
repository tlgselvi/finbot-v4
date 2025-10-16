/**
 * FinBot v4 - User Role Manager Component
 * Interface for managing user roles and approval permissions
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users,
  Shield,
  Settings,
  Plus,
  Edit,
  Trash2,
  Search,
  UserCheck,
  AlertTriangle,
  Save,
  X,
  Crown,
  Key
} from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  level: number;
  isSystem: boolean;
  userCount: number;
}

interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
  isSystem: boolean;
}

export const UserRoleManager: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Mock data for demonstration
      const mockUsers: User[] = [
        {
          id: 'user-1',
          name: 'Ahmet Yılmaz',
          email: 'ahmet@company.com',
          roles: ['finance_manager', 'approver_level_1'],
          permissions: ['view_workflows', 'approve_level_1', 'create_rules'],
          isActive: true,
          lastLogin: new Date('2024-10-16T10:30:00Z'),
          createdAt: new Date('2024-01-15T09:00:00Z')
        },
        {
          id: 'user-2',
          name: 'Fatma Demir',
          email: 'fatma@company.com',
          roles: ['department_head', 'approver_level_2'],
          permissions: ['view_workflows', 'approve_level_2', 'delegate_workflows', 'escalate_workflows'],
          isActive: true,
          lastLogin: new Date('2024-10-16T14:15:00Z'),
          createdAt: new Date('2024-02-01T10:00:00Z')
        },
        {
          id: 'user-3',
          name: 'Mehmet Kaya',
          email: 'mehmet@company.com',
          roles: ['cfo', 'approver_level_3'],
          permissions: ['view_workflows', 'approve_level_3', 'emergency_override', 'manage_users'],
          isActive: true,
          lastLogin: new Date('2024-10-16T16:45:00Z'),
          createdAt: new Date('2024-01-10T08:30:00Z')
        }
      ];

      const mockRoles: Role[] = [
        {
          id: 'finance_manager',
          name: 'Finance Manager',
          description: 'Can approve level 1 transactions and manage financial rules',
          permissions: ['view_workflows', 'approve_level_1', 'create_rules', 'view_reports'],
          level: 1,
          isSystem: false,
          userCount: 3
        },
        {
          id: 'department_head',
          name: 'Department Head',
          description: 'Can approve level 2 transactions and manage team workflows',
          permissions: ['view_workflows', 'approve_level_2', 'delegate_workflows', 'escalate_workflows'],
          level: 2,
          isSystem: false,
          userCount: 5
        },
        {
          id: 'cfo',
          name: 'Chief Financial Officer',
          description: 'Can approve high-level transactions and override workflows',
          permissions: ['view_workflows', 'approve_level_3', 'emergency_override', 'manage_users', 'view_audit_reports'],
          level: 3,
          isSystem: false,
          userCount: 1
        },
        {
          id: 'admin',
          name: 'System Administrator',
          description: 'Full system access and configuration',
          permissions: ['*'],
          level: 99,
          isSystem: true,
          userCount: 2
        }
      ];

      const mockPermissions: Permission[] = [
        { id: 'view_workflows', name: 'View Workflows', description: 'Can view approval workflows', category: 'Workflow', isSystem: false },
        { id: 'approve_level_1', name: 'Approve Level 1', description: 'Can approve level 1 transactions', category: 'Approval', isSystem: false },
        { id: 'approve_level_2', name: 'Approve Level 2', description: 'Can approve level 2 transactions', category: 'Approval', isSystem: false },
        { id: 'approve_level_3', name: 'Approve Level 3', description: 'Can approve level 3 transactions', category: 'Approval', isSystem: false },
        { id: 'create_rules', name: 'Create Rules', description: 'Can create and modify approval rules', category: 'Configuration', isSystem: false },
        { id: 'delegate_workflows', name: 'Delegate Workflows', description: 'Can delegate workflows to other users', category: 'Workflow', isSystem: false },
        { id: 'escalate_workflows', name: 'Escalate Workflows', description: 'Can escalate workflows to higher levels', category: 'Workflow', isSystem: false },
        { id: 'emergency_override', name: 'Emergency Override', description: 'Can override workflows in emergency situations', category: 'Override', isSystem: false },
        { id: 'manage_users', name: 'Manage Users', description: 'Can manage user roles and permissions', category: 'Administration', isSystem: true },
        { id: 'view_audit_reports', name: 'View Audit Reports', description: 'Can view and generate audit reports', category: 'Reporting', isSystem: false },
        { id: 'view_reports', name: 'View Reports', description: 'Can view system reports', category: 'Reporting', isSystem: false }
      ];

      setUsers(mockUsers);
      setRoles(mockRoles);
      setPermissions(mockPermissions);
    } catch (error) {
      setError('Failed to load data');
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUserRoles = async (userId: string, newRoles: string[]) => {
    try {
      // Mock API call
      setUsers(prev => prev.map(user => 
        user.id === userId 
          ? { ...user, roles: newRoles }
          : user
      ));
      
      setEditingUser(null);
    } catch (error) {
      setError('Failed to update user roles');
    }
  };

  const handleUpdateUserPermissions = async (userId: string, newPermissions: string[]) => {
    try {
      // Mock API call
      setUsers(prev => prev.map(user => 
        user.id === userId 
          ? { ...user, permissions: newPermissions }
          : user
      ));
    } catch (error) {
      setError('Failed to update user permissions');
    }
  };

  const handleCreateRole = async (roleData: Partial<Role>) => {
    try {
      const newRole: Role = {
        id: `role-${Date.now()}`,
        name: roleData.name || '',
        description: roleData.description || '',
        permissions: roleData.permissions || [],
        level: roleData.level || 1,
        isSystem: false,
        userCount: 0
      };

      setRoles(prev => [...prev, newRole]);
      setEditingRole(null);
    } catch (error) {
      setError('Failed to create role');
    }
  };

  const handleUpdateRole = async (roleId: string, roleData: Partial<Role>) => {
    try {
      setRoles(prev => prev.map(role => 
        role.id === roleId 
          ? { ...role, ...roleData }
          : role
      ));
      
      setEditingRole(null);
    } catch (error) {
      setError('Failed to update role');
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('Are you sure you want to delete this role?')) {
      return;
    }

    try {
      setRoles(prev => prev.filter(role => role.id !== roleId));
    } catch (error) {
      setError('Failed to delete role');
    }
  };

  const getRoleLevel = (roleName: string): number => {
    const role = roles.find(r => r.id === roleName);
    return role?.level || 0;
  };

  const getPermissionsByCategory = () => {
    return permissions.reduce((acc, permission) => {
      if (!acc[permission.category]) {
        acc[permission.category] = [];
      }
      acc[permission.category].push(permission);
      return acc;
    }, {} as Record<string, Permission[]>);
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2" />
        <span>Loading user management...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Role Management</h1>
          <p className="text-gray-600">Manage user roles and approval permissions</p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={() => setEditingRole('new')} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            New Role
          </Button>
        </div>
      </div>

      {error && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            Users ({users.length})
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Shield className="h-4 w-4 mr-2" />
            Roles ({roles.length})
          </TabsTrigger>
          <TabsTrigger value="permissions">
            <Key className="h-4 w-4 mr-2" />
            Permissions ({permissions.length})
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Users List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredUsers.map((user) => (
              <Card key={user.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{user.name}</CardTitle>
                      <p className="text-sm text-gray-600">{user.email}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={user.isActive ? "default" : "secondary"}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingUser(editingUser === user.id ? null : user.id)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current Roles */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Current Roles</h4>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map(roleId => {
                        const role = roles.find(r => r.id === roleId);
                        return (
                          <Badge key={roleId} variant="outline" className="text-xs">
                            {role?.name || roleId}
                            {role?.level && (
                              <Crown className="h-3 w-3 ml-1" />
                            )}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  {/* Edit Mode */}
                  {editingUser === user.id && (
                    <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
                      <h5 className="font-medium">Edit User Roles</h5>
                      
                      {/* Role Selection */}
                      <div className="space-y-2">
                        {roles.filter(r => !r.isSystem).map(role => (
                          <div key={role.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`${user.id}-${role.id}`}
                              checked={user.roles.includes(role.id)}
                              onCheckedChange={(checked) => {
                                const newRoles = checked
                                  ? [...user.roles, role.id]
                                  : user.roles.filter(r => r !== role.id);
                                handleUpdateUserRoles(user.id, newRoles);
                              }}
                            />
                            <label htmlFor={`${user.id}-${role.id}`} className="text-sm">
                              {role.name}
                              <span className="text-gray-500 ml-1">(Level {role.level})</span>
                            </label>
                          </div>
                        ))}
                      </div>

                      <div className="flex space-x-2">
                        <Button size="sm" onClick={() => setEditingUser(null)}>
                          <Save className="h-3 w-3 mr-1" />
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingUser(null)}>
                          <X className="h-3 w-3 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* User Stats */}
                  <div className="text-xs text-gray-500 space-y-1">
                    <div>Last Login: {user.lastLogin?.toLocaleDateString() || 'Never'}</div>
                    <div>Member Since: {user.createdAt.toLocaleDateString()}</div>
                    <div>Permissions: {user.permissions.length}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Roles Tab */}
        <TabsContent value="roles" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {roles.map((role) => (
              <Card key={role.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg flex items-center">
                        {role.name}
                        {role.isSystem && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            System
                          </Badge>
                        )}
                      </CardTitle>
                      <p className="text-sm text-gray-600">{role.description}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">
                        Level {role.level}
                      </Badge>
                      {!role.isSystem && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingRole(role.id)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteRole(role.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Permissions */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Permissions</h4>
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.slice(0, 5).map(permId => {
                        const permission = permissions.find(p => p.id === permId);
                        return (
                          <Badge key={permId} variant="outline" className="text-xs">
                            {permission?.name || permId}
                          </Badge>
                        );
                      })}
                      {role.permissions.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{role.permissions.length - 5} more
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>{role.userCount} users</span>
                    <span>{role.permissions.length} permissions</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Permissions Tab */}
        <TabsContent value="permissions" className="space-y-4">
          {Object.entries(getPermissionsByCategory()).map(([category, categoryPermissions]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-lg">{category}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {categoryPermissions.map(permission => (
                    <div key={permission.id} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <h5 className="font-medium text-sm">{permission.name}</h5>
                        {permission.isSystem && (
                          <Badge variant="secondary" className="text-xs">
                            System
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-600">{permission.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Role Edit Modal */}
      {editingRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>
                {editingRole === 'new' ? 'Create New Role' : 'Edit Role'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Role form would go here */}
              <div className="space-y-4">
                <Input placeholder="Role Name" />
                <Input placeholder="Description" />
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Level 1</SelectItem>
                    <SelectItem value="2">Level 2</SelectItem>
                    <SelectItem value="3">Level 3</SelectItem>
                  </SelectContent>
                </Select>
                
                {/* Permission selection */}
                <div>
                  <h4 className="font-medium mb-2">Permissions</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {permissions.map(permission => (
                      <div key={permission.id} className="flex items-center space-x-2">
                        <Checkbox id={permission.id} />
                        <label htmlFor={permission.id} className="text-sm">
                          {permission.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex space-x-2">
                <Button onClick={() => setEditingRole(null)}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
                <Button variant="outline" onClick={() => setEditingRole(null)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};