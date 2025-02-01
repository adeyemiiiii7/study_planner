const getClassroomCreatedTemplate = (userData, classroomData) => {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; border-radius: 10px; margin-top: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #f0f0f0;">
            <h1 style="color: #2c3e50; margin: 0; font-size: 24px;">Welcome to StudyMate!</h1>
        </div>

        <!-- Main Content -->
        <div style="padding: 20px 0;">
            <p style="color: #34495e; font-size: 16px; line-height: 1.6;">Dear <strong>${userData.first_name}</strong>,</p>
            
            <p style="color: #34495e; font-size: 16px; line-height: 1.6;">We are excited to inform you that your new classroom has been successfully created on <strong>StudyMate</strong>. As a course rep, you're now ready to manage resources, quizzes, and announcements for your classroom.</p>

            <!-- Classroom Details Box -->
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                <h2 style="color: #2c3e50; font-size: 18px; margin-top: 0;">Classroom Details</h2>
                <ul style="list-style: none; padding: 0; margin: 0;">
                    <li style="color: #34495e; padding: 5px 0;">
                        <strong>Classroom Name:</strong> ${classroomData.name}
                    </li>
                    <li style="color: #34495e; padding: 5px 0;">
                        <strong>Department:</strong> ${classroomData.department}
                    </li>
                    <li style="color: #34495e; padding: 5px 0;">
                        <strong>Level:</strong> ${classroomData.level}
                    </li>
                    <li style="color: #34495e; padding: 5px 0;">
                        <strong>Join Code:</strong> <span style="background-color: #e3f2fd; padding: 2px 8px; border-radius: 3px;">${classroomData.joinCode}</span>
                    </li>
                </ul>
            </div>

            <!-- Next Steps Section -->
            <div style="margin: 20px 0;">
                <h2 style="color: #2c3e50; font-size: 18px;">Your Next Steps</h2>
                <ol style="color: #34495e; padding-left: 20px; line-height: 1.6;">
                    <li><strong>Upload Resources:</strong> Post any relevant course materials for your students to access.</li>
                    <li><strong>Create Quizzes:</strong> Prepare quizzes for your students to assess their learning.</li>
                    <li><strong>Post Announcements:</strong> Keep your students updated with the latest news and course information.</li>
                </ol>
            </div>

            <p style="color: #34495e; font-size: 16px; line-height: 1.6;">If you have any questions or need assistance, don't hesitate to reach out.</p>
        </div>

        <!-- Footer -->
        <div style="text-align: center; padding-top: 20px; border-top: 2px solid #f0f0f0;">
            <p style="color: #7f8c8d; font-size: 14px;">Thank you for being a part of <strong>StudyMate</strong></p>
            <p style="color: #7f8c8d; margin-bottom: 20px;">Best Regards,<br>The <strong>StudyMate</strong> Team</p>
            
            <!-- Logo -->
            <div style="display: flex; align-items: center; justify-content: center; margin-top: 20px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#0e161b" style="margin-right: 8px;">
                    <path d="M12 14l9-5-9-5-9 5 9 5z"/>
                    <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>
                    <path d="M12 14l-6.16-3.422a12.083 12.083 0 00-.665 6.479A11.952 11.952 0 0112 20.055a11.952 11.952 0 016.824-2.998 12.078 12.078 0 00-.665-6.479L12 14z"/>
                </svg>
                <span style="color: #0e161b; font-size: 20px; font-weight: bold;">StudyMate</span>
            </div>
        </div>
    </div>
</body>
</html>`;
};

module.exports ={ getClassroomCreatedTemplate};