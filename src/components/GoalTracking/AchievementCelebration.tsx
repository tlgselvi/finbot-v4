/**
 * Achievement Celebration Component
 * Animated celebration modal for milestones and goal completions
 */

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  Button,
  Avatar,
  Chip,
  Card,
  CardContent,
  IconButton,
  Slide,
  Zoom,
  Fade
} from '@mui/material';
import {
  EmojiEvents as TrophyIcon,
  Close as CloseIcon,
  Share as ShareIcon,
  Download as DownloadIcon,
  Celebration as CelebrationIcon,
  Star as StarIcon,
  Flag as GoalIcon,
  Timeline as MilestoneIcon
} from '@mui/icons-material';

import { formatCurrency, formatPercentage } from '../../utils/formatters';

interface AchievementData {
  type: 'milestone' | 'goal_completion' | 'streak' | 'category_master' | 'savings_hero';
  title: string;
  description: string;
  goalTitle?: string;
  targetAmount?: number;
  progress?: number;
  points?: number;
  badge?: string;
  celebrationMessage?: string;
}

interface AchievementCelebrationProps {
  open: boolean;
  onClose: () => void;
  achievementData: AchievementData | null;
}

const AchievementCelebration: React.FC<AchievementCelebrationProps> = ({
  open,
  onClose,
  achievementData
}) => {
  const [showConfetti, setShowConfetti] = useState(false);
  const [animationPhase, setAnimationPhase] = useState(0);

  useEffect(() => {
    if (open && achievementData) {
      setShowConfetti(true);
      setAnimationPhase(0);
      
      // Animation sequence
      const timer1 = setTimeout(() => setAnimationPhase(1), 300);
      const timer2 = setTimeout(() => setAnimationPhase(2), 800);
      const timer3 = setTimeout(() => setAnimationPhase(3), 1300);
      
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    } else {
      setShowConfetti(false);
      setAnimationPhase(0);
    }
  }, [open, achievementData]);

  const getAchievementIcon = (type: string) => {
    switch (type) {
      case 'milestone':
        return <MilestoneIcon sx={{ fontSize: 48 }} />;
      case 'goal_completion':
        return <GoalIcon sx={{ fontSize: 48 }} />;
      case 'streak':
        return <StarIcon sx={{ fontSize: 48 }} />;
      default:
        return <TrophyIcon sx={{ fontSize: 48 }} />;
    }
  };

  const getAchievementColor = (type: string) => {
    switch (type) {
      case 'milestone':
        return 'primary';
      case 'goal_completion':
        return 'success';
      case 'streak':
        return 'warning';
      default:
        return 'secondary';
    }
  };

  const getCelebrationEmoji = (type: string) => {
    switch (type) {
      case 'milestone':
        return '🎯';
      case 'goal_completion':
        return '🎉';
      case 'streak':
        return '🔥';
      case 'category_master':
        return '👑';
      case 'savings_hero':
        return '💪';
      default:
        return '🏆';
    }
  };

  const handleShare = () => {
    if (achievementData) {
      const shareText = `🎉 Just achieved: ${achievementData.title}! ${achievementData.description}`;
      
      if (navigator.share) {
        navigator.share({
          title: 'Goal Achievement!',
          text: shareText,
          url: window.location.href
        });
      } else {
        // Fallback to clipboard
        navigator.clipboard.writeText(shareText);
      }
    }
  };

  const renderConfetti = () => {
    if (!showConfetti) return null;

    const confettiPieces = Array.from({ length: 50 }, (_, i) => (
      <Box
        key={i}
        sx={{
          position: 'absolute',
          width: '10px',
          height: '10px',
          backgroundColor: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][i % 6],
          borderRadius: '50%',
          left: `${Math.random() * 100}%`,
          top: '-10px',
          animation: `confetti-fall 3s linear infinite`,
          animationDelay: `${Math.random() * 3}s`,
          '@keyframes confetti-fall': {
            '0%': {
              transform: 'translateY(-100vh) rotate(0deg)',
              opacity: 1
            },
            '100%': {
              transform: 'translateY(100vh) rotate(720deg)',
              opacity: 0
            }
          }
        }}
      />
    ));

    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 9999,
          overflow: 'hidden'
        }}
      >
        {confettiPieces}
      </Box>
    );
  };

  if (!achievementData) return null;

  return (
    <>
      {renderConfetti()}
      
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            textAlign: 'center',
            overflow: 'visible'
          }
        }}
      >
        <DialogContent sx={{ p: 4, position: 'relative' }}>
          {/* Close Button */}
          <IconButton
            onClick={onClose}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              color: 'white',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.1)'
              }
            }}
          >
            <CloseIcon />
          </IconButton>

          {/* Main Achievement Display */}
          <Box sx={{ mb: 4 }}>
            {/* Trophy Animation */}
            <Zoom in={animationPhase >= 1} timeout={500}>
              <Box sx={{ mb: 3 }}>
                <Avatar
                  sx={{
                    width: 120,
                    height: 120,
                    mx: 'auto',
                    mb: 2,
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(10px)',
                    border: '3px solid rgba(255, 255, 255, 0.3)',
                    fontSize: '48px'
                  }}
                >
                  {getCelebrationEmoji(achievementData.type)}
                </Avatar>
                
                <Typography
                  variant="h3"
                  component="h1"
                  sx={{
                    fontWeight: 'bold',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
                    mb: 1
                  }}
                >
                  Congratulations!
                </Typography>
              </Box>
            </Zoom>

            {/* Achievement Details */}
            <Slide direction="up" in={animationPhase >= 2} timeout={500}>
              <Card
                sx={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  color: 'text.primary',
                  backdropFilter: 'blur(10px)',
                  borderRadius: 2,
                  mb: 3
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box display="flex" alignItems="center" justifyContent="center" gap={2} mb={2}>
                    <Avatar
                      sx={{
                        bgcolor: `${getAchievementColor(achievementData.type)}.main`,
                        width: 56,
                        height: 56
                      }}
                    >
                      {getAchievementIcon(achievementData.type)}
                    </Avatar>
                    
                    <Box textAlign="left">
                      <Typography variant="h5" fontWeight="bold" gutterBottom>
                        {achievementData.title}
                      </Typography>
                      
                      {achievementData.goalTitle && (
                        <Typography variant="subtitle1" color="text.secondary">
                          Goal: {achievementData.goalTitle}
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.6 }}>
                    {achievementData.description}
                  </Typography>

                  {/* Achievement Stats */}
                  <Box display="flex" justifyContent="center" gap={2} flexWrap="wrap">
                    {achievementData.targetAmount && (
                      <Chip
                        label={`Target: ${formatCurrency(achievementData.targetAmount)}`}
                        color="primary"
                        variant="outlined"
                        icon={<GoalIcon />}
                      />
                    )}
                    
                    {achievementData.progress && (
                      <Chip
                        label={`Progress: ${formatPercentage(achievementData.progress)}`}
                        color="success"
                        variant="outlined"
                        icon={<MilestoneIcon />}
                      />
                    )}
                    
                    {achievementData.points && (
                      <Chip
                        label={`+${achievementData.points} points`}
                        color="warning"
                        variant="outlined"
                        icon={<StarIcon />}
                      />
                    )}
                  </Box>

                  {achievementData.celebrationMessage && (
                    <Box
                      sx={{
                        mt: 2,
                        p: 2,
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        borderRadius: 1,
                        border: '1px solid rgba(76, 175, 80, 0.3)'
                      }}
                    >
                      <Typography variant="body2" fontStyle="italic">
                        💡 {achievementData.celebrationMessage}
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Slide>

            {/* Action Buttons */}
            <Fade in={animationPhase >= 3} timeout={500}>
              <Box display="flex" justifyContent="center" gap={2} flexWrap="wrap">
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleShare}
                  startIcon={<ShareIcon />}
                  sx={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    color: 'white',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.3)'
                    }
                  }}
                >
                  Share Achievement
                </Button>
                
                <Button
                  variant="outlined"
                  size="large"
                  onClick={onClose}
                  sx={{
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    color: 'white',
                    '&:hover': {
                      borderColor: 'white',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)'
                    }
                  }}
                >
                  Continue
                </Button>
              </Box>
            </Fade>
          </Box>

          {/* Motivational Quote */}
          <Fade in={animationPhase >= 3} timeout={800}>
            <Box
              sx={{
                mt: 3,
                p: 2,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 2,
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}
            >
              <Typography variant="body2" fontStyle="italic" sx={{ opacity: 0.9 }}>
                "Success is the sum of small efforts repeated day in and day out." 
                <br />
                Keep up the amazing work! 🌟
              </Typography>
            </Box>
          </Fade>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AchievementCelebration;