"""
Notification Manager
Handles sending notifications for anomaly alerts
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
import aiohttp
import json
from datetime import datetime
import os

logger = logging.getLogger(__name__)

class NotificationManager:
    """
    Manages notification sending for anomaly alerts
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._get_default_config()
        self.session = None
        self.is_initialized = False
    
    def _get_default_config(self) -> Dict:
        """Get default notification configuration"""
        return {
            'notification_service_url': os.getenv('NOTIFICATION_SERVICE_URL', 'http://localhost:3001'),
            'push_notification_url': os.getenv('PUSH_NOTIFICATION_URL', 'http://localhost:3002'),
            'email_service_url': os.getenv('EMAIL_SERVICE_URL', 'http://localhost:3003'),
            'webhook_url': os.getenv('WEBHOOK_URL'),
            'notification_settings': {
                'enable_push': True,
                'enable_email': True,
                'enable_webhook': False,
                'retry_attempts': 3,
                'retry_delay': 5  # seconds
            },
            'alert_templates': {
                'critical': {
                    'title': '🚨 Critical: Unusual Transaction Detected',
                    'priority': 'high'
                },
                'high': {
                    'title': '⚠️ Alert: Suspicious Transaction',
                    'priority': 'high'
                },
                'medium': {
                    'title': '📊 Notice: Transaction Pattern Change',
                    'priority': 'normal'
                },
                'low': {
                    'title': '💡 Info: Minor Transaction Anomaly',
                    'priority': 'low'
                }
            }
        }
    
    async def initialize(self) -> bool:
        """
        Initialize notification manager
        
        Returns:
            True if successful, False otherwise
        """
        try:
            # Create HTTP session
            timeout = aiohttp.ClientTimeout(total=30)
            self.session = aiohttp.ClientSession(timeout=timeout)
            
            # Test connectivity to notification services
            await self._test_services()
            
            self.is_initialized = True
            logger.info("Notification manager initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Notification manager initialization error: {str(e)}")
            return False
    
    async def _test_services(self) -> None:
        """Test connectivity to notification services"""
        try:
            # Test main notification service
            if self.config['notification_service_url']:
                await self._test_service_health(
                    f"{self.config['notification_service_url']}/health"
                )
            
            logger.info("Notification services connectivity tested")
            
        except Exception as e:
            logger.warning(f"Some notification services may be unavailable: {str(e)}")
    
    async def _test_service_health(self, url: str) -> bool:
        """Test if a service is healthy"""
        try:
            async with self.session.get(url) as response:
                return response.status == 200
        except Exception:
            return False
    
    async def send_anomaly_alert(self, alert_data: Dict) -> Dict:
        """
        Send anomaly alert notification
        
        Args:
            alert_data: Alert information dictionary
            
        Returns:
            Notification sending results
        """
        try:
            if not self.is_initialized:
                raise ValueError("Notification manager not initialized")
            
            alert_level = alert_data.get('alert_level', 'medium')
            user_id = alert_data.get('user_id')
            
            if not user_id:
                raise ValueError("Missing user_id in alert data")
            
            # Get alert template
            template = self.config['alert_templates'].get(alert_level, 
                                                        self.config['alert_templates']['medium'])
            
            # Prepare notification payload
            notification_payload = self._prepare_notification_payload(alert_data, template)
            
            # Send notifications through different channels
            results = {}
            
            if self.config['notification_settings']['enable_push']:
                results['push'] = await self._send_push_notification(
                    user_id, notification_payload
                )
            
            if self.config['notification_settings']['enable_email']:
                results['email'] = await self._send_email_notification(
                    user_id, notification_payload
                )
            
            if self.config['notification_settings']['enable_webhook']:
                results['webhook'] = await self._send_webhook_notification(
                    notification_payload
                )
            
            # Store notification record
            await self._store_notification_record(alert_data, results)
            
            logger.info(f"Anomaly alert sent for user {user_id}, transaction {alert_data.get('transaction_id')}")
            
            return {
                'success': True,
                'alert_id': alert_data.get('transaction_id'),
                'channels': results,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error sending anomaly alert: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'alert_id': alert_data.get('transaction_id')
            }
    
    def _prepare_notification_payload(self, alert_data: Dict, template: Dict) -> Dict:
        """Prepare notification payload from alert data"""
        
        transaction_id = alert_data.get('transaction_id')
        anomaly_score = alert_data.get('anomaly_score', 0)
        confidence = alert_data.get('confidence', 0)
        explanation = alert_data.get('explanation', {})
        
        # Create rich notification content
        payload = {
            'title': template['title'],
            'message': alert_data.get('message', 'Unusual transaction detected'),
            'priority': template['priority'],
            'alert_type': 'anomaly_detection',
            'alert_level': alert_data.get('alert_level', 'medium'),
            'data': {
                'transaction_id': transaction_id,
                'anomaly_score': round(anomaly_score, 3),
                'confidence': round(confidence, 3),
                'timestamp': alert_data.get('timestamp'),
                'explanation': explanation
            },
            'actions': [
                {
                    'id': 'view_transaction',
                    'title': 'View Transaction',
                    'url': f'/transactions/{transaction_id}'
                },
                {
                    'id': 'mark_legitimate',
                    'title': 'Mark as Legitimate',
                    'action': 'mark_legitimate'
                },
                {
                    'id': 'report_fraud',
                    'title': 'Report Fraud',
                    'action': 'report_fraud'
                }
            ]
        }
        
        # Add explanation details if available
        if explanation.get('reasons'):
            payload['details'] = {
                'reasons': explanation['reasons'][:3],  # Top 3 reasons
                'recommendation': explanation.get('recommendation', '')
            }
        
        return payload
    
    async def _send_push_notification(self, user_id: str, payload: Dict) -> Dict:
        """Send push notification"""
        try:
            url = f"{self.config['push_notification_url']}/send"
            
            push_payload = {
                'user_id': user_id,
                'notification': {
                    'title': payload['title'],
                    'body': payload['message'],
                    'data': payload['data'],
                    'priority': payload['priority'],
                    'actions': payload.get('actions', [])
                }
            }
            
            result = await self._send_with_retry(url, push_payload)
            
            return {
                'success': result['success'],
                'channel': 'push',
                'message_id': result.get('message_id'),
                'error': result.get('error')
            }
            
        except Exception as e:
            logger.error(f"Push notification error: {str(e)}")
            return {
                'success': False,
                'channel': 'push',
                'error': str(e)
            }
    
    async def _send_email_notification(self, user_id: str, payload: Dict) -> Dict:
        """Send email notification"""
        try:
            url = f"{self.config['email_service_url']}/send"
            
            # Create email content
            email_payload = {
                'user_id': user_id,
                'email': {
                    'subject': payload['title'],
                    'template': 'anomaly_alert',
                    'data': {
                        'alert_level': payload['alert_level'],
                        'message': payload['message'],
                        'transaction_details': payload['data'],
                        'explanation': payload.get('details', {}),
                        'actions': payload.get('actions', [])
                    }
                }
            }
            
            result = await self._send_with_retry(url, email_payload)
            
            return {
                'success': result['success'],
                'channel': 'email',
                'message_id': result.get('message_id'),
                'error': result.get('error')
            }
            
        except Exception as e:
            logger.error(f"Email notification error: {str(e)}")
            return {
                'success': False,
                'channel': 'email',
                'error': str(e)
            }
    
    async def _send_webhook_notification(self, payload: Dict) -> Dict:
        """Send webhook notification"""
        try:
            if not self.config['webhook_url']:
                return {
                    'success': False,
                    'channel': 'webhook',
                    'error': 'Webhook URL not configured'
                }
            
            webhook_payload = {
                'event': 'anomaly_detected',
                'timestamp': datetime.now().isoformat(),
                'data': payload
            }
            
            result = await self._send_with_retry(
                self.config['webhook_url'], webhook_payload
            )
            
            return {
                'success': result['success'],
                'channel': 'webhook',
                'response': result.get('response'),
                'error': result.get('error')
            }
            
        except Exception as e:
            logger.error(f"Webhook notification error: {str(e)}")
            return {
                'success': False,
                'channel': 'webhook',
                'error': str(e)
            }
    
    async def _send_with_retry(self, url: str, payload: Dict) -> Dict:
        """Send HTTP request with retry logic"""
        
        max_attempts = self.config['notification_settings']['retry_attempts']
        retry_delay = self.config['notification_settings']['retry_delay']
        
        for attempt in range(max_attempts):
            try:
                async with self.session.post(
                    url,
                    json=payload,
                    headers={'Content-Type': 'application/json'}
                ) as response:
                    
                    if response.status == 200:
                        result = await response.json()
                        return {
                            'success': True,
                            'response': result,
                            'status_code': response.status
                        }
                    else:
                        error_text = await response.text()
                        if attempt == max_attempts - 1:  # Last attempt
                            return {
                                'success': False,
                                'error': f'HTTP {response.status}: {error_text}',
                                'status_code': response.status
                            }
                        
            except Exception as e:
                if attempt == max_attempts - 1:  # Last attempt
                    return {
                        'success': False,
                        'error': str(e)
                    }
            
            # Wait before retry
            if attempt < max_attempts - 1:
                await asyncio.sleep(retry_delay)
        
        return {
            'success': False,
            'error': 'Max retry attempts exceeded'
        }
    
    async def _store_notification_record(self, alert_data: Dict, results: Dict) -> None:
        """Store notification record for tracking"""
        try:
            # This would typically store in database
            # For now, just log the notification
            notification_record = {
                'alert_id': alert_data.get('transaction_id'),
                'user_id': alert_data.get('user_id'),
                'alert_level': alert_data.get('alert_level'),
                'channels_sent': list(results.keys()),
                'success_channels': [k for k, v in results.items() if v.get('success')],
                'timestamp': datetime.now().isoformat()
            }
            logger.info(f"Notification record: {json.dumps(notification_record)}")
            
        except Exception as e:
            logger.error(f"Error storing notification record: {str(e)}")
    
    async def send_batch_summary(self, user_id: str, summary_data: Dict) -> Dict:
        """
        Send batch anomaly detection summary
        
        Args:
            user_id: User identifier
            summary_data: Batch processing summary
            
        Returns:
            Notification sending results
        """
        try:
            if summary_data.get('anomalies_detected', 0) == 0:
                return {'success': True, 'message': 'No anomalies to report'}
            
            # Prepare summary notification
            payload = {
                'title': '📊 Daily Anomaly Detection Summary',
                'message': f"Detected {summary_data['anomalies_detected']} unusual transactions",
                'priority': 'normal',
                'alert_type': 'batch_summary',
                'data': summary_data
            }
            
            # Send summary notification
            result = await self._send_push_notification(user_id, payload)
            
            return result
            
        except Exception as e:
            logger.error(f"Error sending batch summary: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def cleanup(self) -> None:
        """Cleanup notification manager resources"""
        try:
            if self.session:
                await self.session.close()
                self.session = None
            
            self.is_initialized = False
            logger.info("Notification manager cleaned up")
            
        except Exception as e:
            logger.error(f"Notification cleanup error: {str(e)}")