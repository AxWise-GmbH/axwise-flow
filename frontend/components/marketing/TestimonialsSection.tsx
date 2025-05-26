import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, Quote } from 'lucide-react';

export const TestimonialsSection = () => {
  const testimonials = [
    {
      name: "Krists",
      role: "Senior Product Manager",
      company: "VMware/Volkswagen",
      avatar: "KR",
      rating: 5,
      quote: "AxWise transformed how we handle user research at scale. The AI-powered insights help us identify patterns across interviews that would take our team weeks to discover manually.",
      highlight: "Weeks → Hours"
    },
    {
      name: "Denis",
      role: "Product Designer",
      company: "Alibaba",
      avatar: "DN",
      rating: 5,
      quote: "As a designer working with global teams, AxWise helps me quickly extract actionable insights from user interviews. The persona generation is incredibly detailed and saves us significant time.",
      highlight: "Global Scale Insights"
    },
    {
      name: "Typhanie",
      role: "Senior Product Designer",
      company: "10+ years experience",
      avatar: "TY",
      rating: 5,
      quote: "After a decade in product design, I can say AxWise is a game-changer. It turns raw interview data into structured insights that actually drive product decisions.",
      highlight: "10+ Years Validated"
    },
    {
      name: "Zuzanna",
      role: "Product Lead",
      company: "Rocket Internet/Automotive",
      avatar: "ZU",
      rating: 5,
      quote: "From startup environments to automotive giants, AxWise adapts to any research workflow. The structured analysis helps us move from insights to action faster than ever.",
      highlight: "Startup to Enterprise"
    },
    {
      name: "Alex",
      role: "Senior Product Designer",
      company: "20 years automotive experience",
      avatar: "AL",
      rating: 5,
      quote: "Two decades in automotive product design taught me the value of deep user understanding. AxWise captures nuances in user feedback that traditional analysis often misses.",
      highlight: "20 Years Experience"
    },
    {
      name: "Joris",
      role: "Startup Founder",
      company: "20 years experience",
      avatar: "JO",
      rating: 5,
      quote: "As a founder with 20 years of experience, I know good tools when I see them. AxWise gives startups enterprise-level research capabilities without the enterprise overhead.",
      highlight: "Founder Approved"
    }
  ];

  const stats = [
    { value: "95%", label: "Time Reduction" },
    { value: "3x", label: "More Insights" },
    { value: "90%", label: "Stakeholder Buy-in" },
    { value: "40%", label: "Faster Time-to-Market" }
  ];

  return (
    <section className="py-16 md:py-24 bg-muted/30">
      <div className="container px-4 md:px-6 mx-auto">
        <div className="text-center mb-16">
          <Badge variant="default" className="mb-4">Testimonials</Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            What Product Teams Are <span className="text-primary">Saying</span>
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            Don't just take our word for it. See how AxWise is transforming
            product development for teams around the world.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-primary mb-2">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {testimonials.map((testimonial, index) => (
            <Card key={index} className="border-primary/20 hover:border-primary/40 transition-colors">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary">
                    {testimonial.avatar}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">{testimonial.name}</h4>
                    <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                    {testimonial.company && (
                      <p className="text-xs text-muted-foreground">{testimonial.company}</p>
                    )}
                  </div>
                  <div className="flex">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <Quote className="w-6 h-6 text-primary/20 absolute -top-2 -left-2" />
                  <p className="text-sm text-muted-foreground mb-3 pl-4">
                    {testimonial.quote}
                  </p>
                </div>

                <Badge variant="secondary" className="text-xs">
                  {testimonial.highlight}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Social Proof */}
        <div className="text-center">
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl p-8 md:p-12 border border-primary/20">
            <h3 className="text-2xl md:text-3xl font-bold mb-4">
              Trusted by people and teams from industry-recognized EU and US corporate companies and Constructor Tech University
            </h3>

            {/* Constructor University Partnership */}
            <div className="mb-8">
              <div className="flex items-center justify-center gap-4 mb-4">
                <img
                  src="/constructor-university-logo.svg"
                  alt="Constructor University"
                  className="h-12 w-auto dark:invert"
                />
              </div>
              <Badge variant="default" className="text-sm px-4 py-2 mb-4 bg-primary text-primary-foreground">
                🏆 Top 30 among 3000 startups in Constructor Tech University's first batch accelerator program
              </Badge>
            </div>

            <p className="text-lg text-muted-foreground mb-6">
              From startups to enterprises, product teams worldwide trust AxWise
              to transform their user research process.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Badge variant="outline" className="text-sm px-4 py-2">
                🚀 Startups
              </Badge>
              <Badge variant="outline" className="text-sm px-4 py-2">
                🏢 EU/US Corporations
              </Badge>
              <Badge variant="outline" className="text-sm px-4 py-2">
                🎓 Constructor University
              </Badge>
              <Badge variant="outline" className="text-sm px-4 py-2">
                📊 Research Teams
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
