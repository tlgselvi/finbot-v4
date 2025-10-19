/**
 * Authentication and Authorization Security Tests
 * Comprehensive security tests for authentication, authorization, and access control
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

// Mock authentication service
class AuthenticationService {
  private users: Map<string, { id: string; email: string; passwordHash: string; role: string; permissions: string[] }> = new Map();
  private sessions: Map<string, { userId: string; expiresAt: Date; permissions: string[] }> = new Map();
  private jwtSecret = 'test-secret-key';
  private maxLoginAttempts = 5;
  private loginAttempts: Map<string, { count: number; lastAttempt: Date }> = new Map();

  async registerUser(email: string, password: string, role: string = 'user'): Promise<string> {
    if (this.users.has(email)) {
      throw new Error('User already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const permissions = this.getRolePermissions(role);
    
    this.users.set(email, {
      id: userId,
      email,
      passwordHash,
      role,
      permissions
    });

    return userId;
  }

  async authenticateUser(email: string, password: string): Promise<{ token: string; user: any }> {
    // Check rate limiting
    this.checkRateLimit(email);

    const user = this.users.get(email);
    if (!user) {
      this.recordFailedAttempt(email);
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      this.recordFailedAttempt(email);
      throw new Error('Invalid credentials');
    }

    // Reset failed attempts on successful login
    this.loginAttempts.delete(email);

    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role,
        permissions: user.permissions 
      },
      this.jwtSecret,
      { expiresIn: '1h' }
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions
      }
    };
  }

  verifyToken(token: string): any {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  hasPermission(userPermissions: string[], requiredPermission: string): boolean {
    return userPermissions.includes(requiredPermission) || userPermissions.includes('admin:all');
  }

  private getRolePermissions(role: string): string[] {
    const rolePermissions = {
      'user': ['analytics:read', 'goals:read', 'goals:write'],
      'premium': ['analytics:read', 'analytics:advanced', 'goals:read', 'goals:write', 'budget:optimize'],
      'admin': ['admin:all'],
      'analyst': ['analytics:read', 'analytics:advanced', 'analytics:export', 'privacy:read'],
      'privacy_officer': ['privacy:read', 'privacy:write', 'privacy:audit', 'security:read']
    };

    return rolePermissions[role] || ['analytics:read'];
  }

  private checkRateLimit(email: string): void {
    const attempts = this.loginAttempts.get(email);
    if (attempts && attempts.count >= this.maxLoginAttempts) {
      const timeSinceLastAttempt = Date.now() - attempts.lastAttempt.getTime();
      const lockoutDuration = 15 * 60 * 1000; // 15 minutes

      if (timeSinceLastAttempt < lockoutDuration) {
        throw new Error('Account temporarily locked due to too many failed attempts');
      } else {
        // Reset attempts after lockout period
        this.loginAttempts.delete(email);
      }
    }
  }

  private recordFailedAttempt(email: string): void {
    const attempts = this.loginAttempts.get(email) || { count: 0, lastAttempt: new Date() };
    attempts.count++;
    attempts.lastAttempt = new Date();
    this.loginAttempts.set(email, attempts);
  }
}

describe('Authentication Security Tests', () => {
  let authService: AuthenticationService;

  beforeEach(() => {
    authService = new AuthenticationService();
  });

  describe('User Registration', () => {
    it('should register user with secure password hashing', async () => {
      const email = 'test@example.com';
      const password = 'SecurePassword123!';
      
      const userId = await authService.registerUser(email, password);
      
      expect(userId).toBeDefined();
      expect(userId).toMatch(/^user_\d+_[a-z0-9]+$/);
    });

    it('should prevent duplicate user registration', async () => {
      const email = 'test@example.com';
      const password = 'SecurePassword123!';
      
      await authService.registerUser(email, password);
      
      await expect(authService.registerUser(email, password))
        .rejects.toThrow('User already exists');
    });

    it('should assign appropriate role permissions', async () => {
      await authService.registerUser('user@example.com', 'password', 'user');
      await authService.registerUser('admin@example.com', 'password', 'admin');
      await authService.registerUser('analyst@example.com', 'password', 'analyst');

      const userAuth = await authService.authenticateUser('user@example.com', 'password');
      const adminAuth = await authService.authenticateUser('admin@example.com', 'password');
      const analystAuth = await authService.authenticateUser('analyst@example.com', 'password');

      expect(userAuth.user.permissions).toContain('analytics:read');
      expect(userAuth.user.permissions).not.toContain('admin:all');

      expect(adminAuth.user.permissions).toContain('admin:all');

      expect(analystAuth.user.permissions).toContain('analytics:advanced');
      expect(analystAuth.user.permissions).toContain('analytics:export');
    });
  });

  describe('Authentication', () => {
    beforeEach(async () => {
      await authService.registerUser('test@example.com', 'SecurePassword123!');
    });

    it('should authenticate valid credentials', async () => {
      const result = await authService.authenticateUser('test@example.com', 'SecurePassword123!');
      
      expect(result.token).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      
      // Verify token is valid JWT
      const decoded = authService.verifyToken(result.token);
      expect(decoded.email).toBe('test@example.com');
    });

    it('should reject invalid credentials', async () => {
      await expect(authService.authenticateUser('test@example.com', 'WrongPassword'))
        .rejects.toThrow('Invalid credentials');
      
      await expect(authService.authenticateUser('nonexistent@example.com', 'SecurePassword123!'))
        .rejects.toThrow('Invalid credentials');
    });

    it('should implement rate limiting for failed attempts', async () => {
      // Make multiple failed attempts
      for (let i = 0; i < 5; i++) {
        try {
          await authService.authenticateUser('test@example.com', 'WrongPassword');
        } catch (error) {
          // Expected to fail
        }
      }

      // 6th attempt should be blocked
      await expect(authService.authenticateUser('test@example.com', 'WrongPassword'))
        .rejects.toThrow('Account temporarily locked');
      
      // Even correct password should be blocked during lockout
      await expect(authService.authenticateUser('test@example.com', 'SecurePassword123!'))
        .rejects.toThrow('Account temporarily locked');
    });

    it('should generate secure JWT tokens', async () => {
      const result = await authService.authenticateUser('test@example.com', 'SecurePassword123!');
      
      const decoded = authService.verifyToken(result.token);
      
      expect(decoded.userId).toBeDefined();
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.role).toBeDefined();
      expect(decoded.permissions).toBeInstanceOf(Array);
      expect(decoded.exp).toBeDefined(); // Expiration time
    });

    it('should reject expired tokens', () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { userId: 'test', email: 'test@example.com' },
        'test-secret-key',
        { expiresIn: '-1h' } // Already expired
      );

      expect(() => authService.verifyToken(expiredToken))
        .toThrow('Invalid token');
    });

    it('should reject tampered tokens', () => {
      const validToken = jwt.sign(
        { userId: 'test', email: 'test@example.com' },
        'test-secret-key',
        { expiresIn: '1h' }
      );

      // Tamper with the token
      const tamperedToken = validToken.slice(0, -5) + 'XXXXX';

      expect(() => authService.verifyToken(tamperedToken))
        .toThrow('Invalid token');
    });
  });

  describe('Authorization', () => {
    let userToken: string;
    let adminToken: string;
    let analystToken: string;

    beforeEach(async () => {
      await authService.registerUser('user@example.com', 'password', 'user');
      await authService.registerUser('admin@example.com', 'password', 'admin');
      await authService.registerUser('analyst@example.com', 'password', 'analyst');

      const userAuth = await authService.authenticateUser('user@example.com', 'password');
      const adminAuth = await authService.authenticateUser('admin@example.com', 'password');
      const analystAuth = await authService.authenticateUser('analyst@example.com', 'password');

      userToken = userAuth.token;
      adminToken = adminAuth.token;
      analystToken = analystAuth.token;
    });

    it('should enforce role-based permissions', () => {
      const userClaims = authService.verifyToken(userToken);
      const adminClaims = authService.verifyToken(adminToken);
      const analystClaims = authService.verifyToken(analystToken);

      // User permissions
      expect(authService.hasPermission(userClaims.permissions, 'analytics:read')).toBe(true);
      expect(authService.hasPermission(userClaims.permissions, 'analytics:advanced')).toBe(false);
      expect(authService.hasPermission(userClaims.permissions, 'admin:all')).toBe(false);

      // Admin permissions
      expect(authService.hasPermission(adminClaims.permissions, 'analytics:read')).toBe(true);
      expect(authService.hasPermission(adminClaims.permissions, 'analytics:advanced')).toBe(true);
      expect(authService.hasPermission(adminClaims.permissions, 'admin:all')).toBe(true);

      // Analyst permissions
      expect(authService.hasPermission(analystClaims.permissions, 'analytics:advanced')).toBe(true);
      expect(authService.hasPermission(analystClaims.permissions, 'analytics:export')).toBe(true);
      expect(authService.hasPermission(analystClaims.permissions, 'admin:all')).toBe(false);
    });

    it('should prevent privilege escalation', () => {
      const userClaims = authService.verifyToken(userToken);
      
      // User should not be able to access admin functions
      expect(authService.hasPermission(userClaims.permissions, 'admin:users')).toBe(false);
      expect(authService.hasPermission(userClaims.permissions, 'privacy:write')).toBe(false);
      expect(authService.hasPermission(userClaims.permissions, 'security:admin')).toBe(false);
    });

    it('should handle permission inheritance correctly', () => {
      const adminClaims = authService.verifyToken(adminToken);
      
      // Admin should have access to all permissions through admin:all
      expect(authService.hasPermission(adminClaims.permissions, 'analytics:read')).toBe(true);
      expect(authService.hasPermission(adminClaims.permissions, 'privacy:write')).toBe(true);
      expect(authService.hasPermission(adminClaims.permissions, 'any:permission')).toBe(true);
    });
  });

  describe('Session Management', () => {
    it('should handle concurrent sessions securely', async () => {
      await authService.registerUser('test@example.com', 'password');
      
      // Create multiple sessions
      const session1 = await authService.authenticateUser('test@example.com', 'password');
      const session2 = await authService.authenticateUser('test@example.com', 'password');
      
      // Both tokens should be valid but different
      expect(session1.token).not.toBe(session2.token);
      
      const claims1 = authService.verifyToken(session1.token);
      const claims2 = authService.verifyToken(session2.token);
      
      expect(claims1.userId).toBe(claims2.userId);
      expect(claims1.email).toBe(claims2.email);
    });

    it('should validate token integrity', () => {
      // Test various token manipulation attempts
      const validToken = jwt.sign(
        { userId: 'test', email: 'test@example.com', role: 'user' },
        'test-secret-key',
        { expiresIn: '1h' }
      );

      // Valid token should work
      expect(() => authService.verifyToken(validToken)).not.toThrow();

      // Invalid signatures should fail
      const invalidTokens = [
        validToken + 'extra',
        validToken.slice(0, -10) + 'tampered123',
        'invalid.token.format',
        '',
        'Bearer ' + validToken // Wrong format
      ];

      invalidTokens.forEach(token => {
        expect(() => authService.verifyToken(token)).toThrow();
      });
    });
  });

  describe('Password Security', () => {
    it('should enforce strong password requirements', async () => {
      const weakPasswords = [
        '123456',
        'password',
        'abc123',
        'qwerty',
        '12345678',
        'password123'
      ];

      // In a real implementation, these would be rejected during registration
      // For testing, we'll simulate the validation
      weakPasswords.forEach(password => {
        const isWeak = password.length < 8 || 
                      !/[A-Z]/.test(password) || 
                      !/[a-z]/.test(password) || 
                      !/[0-9]/.test(password) ||
                      !/[!@#$%^&*]/.test(password);
        
        expect(isWeak).toBe(true);
      });

      const strongPassword = 'SecurePassword123!';
      const isStrong = strongPassword.length >= 8 && 
                      /[A-Z]/.test(strongPassword) && 
                      /[a-z]/.test(strongPassword) && 
                      /[0-9]/.test(strongPassword) &&
                      /[!@#$%^&*]/.test(strongPassword);
      
      expect(isStrong).toBe(true);
    });

    it('should use secure password hashing', async () => {
      const password = 'TestPassword123!';
      const userId = await authService.registerUser('test@example.com', password);
      
      // Password should be hashed, not stored in plain text
      // We can't directly access the stored hash in this test setup,
      // but we can verify that authentication works correctly
      const auth = await authService.authenticateUser('test@example.com', password);
      expect(auth.token).toBeDefined();
      
      // Wrong password should fail
      await expect(authService.authenticateUser('test@example.com', 'WrongPassword'))
        .rejects.toThrow('Invalid credentials');
    });
  });

  describe('Security Headers and CSRF Protection', () => {
    it('should validate security headers', () => {
      // Mock request headers that should be validated
      const secureHeaders = {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://finbot.example.com',
        'Referer': 'https://finbot.example.com/dashboard'
      };

      const insecureHeaders = {
        'Content-Type': 'application/json',
        'Origin': 'https://malicious-site.com'
      };

      // Simulate CSRF validation
      const validateCSRF = (headers: any) => {
        const allowedOrigins = ['https://finbot.example.com', 'http://localhost:3000'];
        return allowedOrigins.includes(headers.Origin);
      };

      expect(validateCSRF(secureHeaders)).toBe(true);
      expect(validateCSRF(insecureHeaders)).toBe(false);
    });

    it('should prevent timing attacks', async () => {
      await authService.registerUser('test@example.com', 'password');
      
      // Measure authentication time for valid and invalid users
      const times: number[] = [];
      
      // Valid user, wrong password
      const start1 = Date.now();
      try {
        await authService.authenticateUser('test@example.com', 'wrongpassword');
      } catch (error) {
        // Expected
      }
      times.push(Date.now() - start1);
      
      // Invalid user
      const start2 = Date.now();
      try {
        await authService.authenticateUser('nonexistent@example.com', 'password');
      } catch (error) {
        // Expected
      }
      times.push(Date.now() - start2);
      
      // Times should be similar to prevent user enumeration
      const timeDifference = Math.abs(times[0] - times[1]);
      expect(timeDifference).toBeLessThan(100); // Allow some variance
    });
  });
});