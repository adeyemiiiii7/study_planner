const UserStudyPreference = require('../models/userStudyPreference');
const UserCourse = require('../models/userCourse');
const nodemailer = require('nodemailer');

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'aladesuyides@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'kugi fihw cugc trye'
  },
  tls: {
    rejectUnauthorized: false
  }
});

class StudentService {
  static async checkExistingSchedule(userId) {
    const existingCourses = await UserCourse.findOne({
      where: { user_id: userId }
    });
    return !!existingCourses;
  }

  static async generateSchedule(userId) {
    const preferences = await UserStudyPreference.findOne({
      where: { user_id: userId }
    });
   // If no preferences exist, return null to indicate preferences need to be set
   if (!preferences) {
    return null;
  }
    const courses = await UserCourse.findAll({
      where: { user_id: userId }
    });
 // Return empty schedule if no courses found
 if (!courses || courses.length === 0) {
  return {};
}

    // Time slots configuration with preferred mapping
    const timeSlots = {
      morning: {
        early: { id: "early_morning", time: "8:00 AM - 9:30 AM" },
        late: { id: "late_morning", time: "9:45 AM - 11:15 AM" }
      },
      afternoon: {
        early: { id: "early_afternoon", time: "2:00 PM - 3:30 PM" },
        late: { id: "late_afternoon", time: "3:45 PM - 5:15 PM" }
      },
      evening: {
        early: { id: "early_evening", time: "6:00 PM - 7:30 PM" },
        late: { id: "late_evening", time: "7:45 PM - 9:15 PM" }
      }
    };

    // Initialize schedule based on preferences
    const schedule = {};
    Object.entries(preferences.daily_preferences).forEach(([day, periods]) => {
      if (periods.length > 0) {
        schedule[day] = {};
        periods.forEach(period => {
          schedule[day][timeSlots[period].early.id] = [];
          schedule[day][timeSlots[period].late.id] = [];
        });
      }
    });

    // Helper function to calculate sessions needed based on units
    const getRequiredSessions = (units) => {
      if (units <= 1) return 1;
      if (units === 2) return 2;
      return units;
    };

    // Sort courses by units (descending)
    const sortedCourses = [...courses].sort((a, b) => {
      const aRequired = getRequiredSessions(a.course_units);
      const bRequired = getRequiredSessions(b.course_units);
      return bRequired - aRequired;
    });

    // Helper to check if a slot is within preferred periods
    const isPreferredSlot = (day, slotId) => {
      const dayPreferences = preferences.daily_preferences[day];
      return dayPreferences.some(period => {
        return [timeSlots[period].early.id, timeSlots[period].late.id].includes(slotId);
      });
    };

    // Schedule courses
    for (const course of sortedCourses) {
      const sessionsNeeded = getRequiredSessions(course.course_units);
      let sessionsScheduled = 0;
      
      for (const day in schedule) {
        if (sessionsScheduled >= sessionsNeeded) break;
        
        const slots = Object.keys(schedule[day]);
        for (const slot of slots) {
          if (!isPreferredSlot(day, slot)) continue;
          if (schedule[day][slot].length === 0) {
            const periodTime = Object.values(timeSlots)
              .flatMap(p => [p.early, p.late])
              .find(s => s.id === slot).time;
              
            schedule[day][slot].push({
              course_code: course.course_code,
              time: periodTime,
              units: course.course_units
            });
            sessionsScheduled++;
            break;
          }
        }
      }
    }

    // Clean up empty slots
    for (const day in schedule) {
      const cleanDay = {};
      for (const slot in schedule[day]) {
        if (schedule[day][slot].length > 0) {
          cleanDay[slot] = schedule[day][slot];
        }
      }
      if (Object.keys(cleanDay).length > 0) {
        schedule[day] = cleanDay;
      } else {
        delete schedule[day];
      }
    }

    return schedule;
  }

  static async analyzeScheduleCompleteness(userId, schedule, courses) {
    const sessionCount = {};
    const requiredSessions = {};
    
    courses.forEach(course => {
      sessionCount[course.course_code] = 0;
      requiredSessions[course.course_code] = course.course_units;
    });

    Object.values(schedule).forEach(daySchedule => {
      Object.values(daySchedule).forEach(timeSlot => {
        timeSlot.forEach(session => {
          sessionCount[session.course_code] = (sessionCount[session.course_code] || 0) + 1;
        });
      });
    });

    const preferences = await UserStudyPreference.findOne({
      where: { user_id: userId }
    });

    const scheduledDays = Object.keys(schedule);
    const allWeekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    const daysWithPreferences = Object.entries(preferences.daily_preferences)
      .filter(([_, slots]) => slots.length > 0)
      .map(([day]) => day);

    const additionalDays = allWeekDays
      .filter(day => !daysWithPreferences.includes(day))
      .slice(-2);

    const weekDays = allWeekDays
      .filter(day => !scheduledDays.includes(day) && !additionalDays.includes(day));

    const analysis = {
      complete: true,
      missing_sessions: [],
      recommendations: [],
      unscheduled_courses: [],
      partially_scheduled: []
    };

    courses.forEach(course => {
      const scheduled = sessionCount[course.course_code] || 0;
      const required = requiredSessions[course.course_code];
      const missing = required - scheduled;

      if (missing > 0) {
        analysis.complete = false;

        if (scheduled === 0) {
          analysis.unscheduled_courses.push({
            course_code: course.course_code,
            required_sessions: required
          });
        } else {
          analysis.partially_scheduled.push({
            course_code: course.course_code,
            scheduled_sessions: scheduled,
            required_sessions: required,
            missing_sessions: missing
          });
        }

        const recommendationSlots = [];
        if (additionalDays.length > 0) {
          additionalDays.forEach(day => {
            recommendationSlots.push({
              day,
              slots: ['evening'],
              message: `Consider using ${day} evening for additional ${course.course_code} sessions`
            });
          });
        }

        if (weekDays.length > 0 && missing > additionalDays.length) {
          weekDays.forEach(day => {
            const dayPrefs = preferences.daily_preferences[day] || [];
            if (dayPrefs.length === 0) {
              recommendationSlots.push({
                day,
                slots: ['morning', 'afternoon', 'evening'],
                message: `Consider adding study periods on ${day} for remaining ${course.course_code} sessions`
              });
            }
          });
        }

        analysis.missing_sessions.push({
          course_code: course.course_code,
          missing_sessions: missing,
          recommended_slots: recommendationSlots
        });
      }
    });

    if (!analysis.complete) {
      if (additionalDays.length > 0) {
        analysis.recommendations.push({
          type: 'additional_days',
          message: `Consider utilizing ${additionalDays.join(' and ')} evenings for missing sessions`,
          days: additionalDays
        });
      }
      
      if (weekDays.length > 0) {
        analysis.recommendations.push({
          type: 'expand_schedule',
          message: `Consider adding study periods on ${weekDays.join(', ')} to accommodate all sessions`,
          days: weekDays
        });
      }

      if (analysis.unscheduled_courses.length > 0) {
        analysis.recommendations.push({
          type: 'priority_scheduling',
          message: `Prioritize scheduling the following unscheduled courses: ${analysis.unscheduled_courses.map(c => c.course_code).join(', ')}`
        });
      }
    }

    return analysis;
  }


  static async sendScheduleEmail(email, firstName, day, sessions) {
    // Add retry logic for email sending
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        const emailTemplate = {
          from: '"Study Buddy" <${process.env.EMAIL_USER}>',
          to: email,
          subject: `Your Study Schedule for ${day}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Hello ${firstName}!</h2>
              <p>Here's your study schedule for tomorrow (${day}):</p>
              
              <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px;">
                ${sessions.map(session => `
                  <div style="background-color: white; padding: 15px; margin-bottom: 10px; border-radius: 5px; border-left: 4px solid #007bff;">
                    <h3 style="margin: 0; color: #007bff;">${session.courseCode}</h3>
                    <p style="margin: 5px 0;"><strong>Time:</strong> ${session.time}</p>
                    <p style="margin: 5px 0;"><strong>Units:</strong> ${session.units}</p>
                  </div>
                `).join('')}
              </div>

              <div style="margin-top: 20px;">
                <p><strong>Tips for tomorrow:</strong></p>
                <ul>
                  <li>Prepare your study materials tonight</li>
                  <li>Get enough rest for a productive day</li>
                  <li>Set alarms for each session</li>
                </ul>
              </div>

              <p style="color: #666;">Happy studying!</p>
            </div>
          `
        };

        await transporter.sendMail(emailTemplate);
        console.log(`Schedule email sent successfully to ${email}`);
        return;
      } catch (error) {
        retryCount++;
        if (retryCount === maxRetries) {
          console.error(`Failed to send schedule email to ${email} after ${maxRetries} attempts:`, error);
          throw error;
        }
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
      }
    }
}

  static formatScheduleForEmail(schedule) {
    let formattedSessions = [];
    
    Object.entries(schedule).forEach(([timeSlot, sessions]) => {
      sessions.forEach(session => {
        formattedSessions.push({
          timeSlot,
          courseCode: session.course_code,
          time: session.time,
          units: session.units
        });
      });
    });

    return formattedSessions.sort((a, b) => {
      const timeA = StudentService.parseTime(a.time.split(' - ')[0]);
      const timeB = StudentService.parseTime(b.time.split(' - ')[0]);
      return timeA - timeB;
    });
  }

  static parseTime(timeStr) {
    const [time, period] = timeStr.split(' ');
    const [hours, minutes] = time.split(':');
    let hour = parseInt(hours);
    
    if (period === 'PM' && hour !== 12) {
      hour += 12;
    } else if (period === 'AM' && hour === 12) {
      hour = 0;
    }
    
    return hour * 60 + parseInt(minutes);
  }
}

module.exports = StudentService;